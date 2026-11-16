"""Local game server that exits as soon as nobody is watching.

The page sends a heartbeat while visible and a bye beacon when it is hidden or
closed. As soon as the last viewer leaves, the server starts a short shutdown
grace period (enough for a reload to reconnect) and then exits. A fallback idle
timeout still handles crashes where the browser cannot send the bye beacon.
"""

from __future__ import annotations

import argparse
import base64
import functools
import hashlib
import http.server
import ipaddress
import json
import re
import socket
import struct
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path
from urllib.parse import parse_qs, urlparse

IDLE_SECONDS = 15
HEARTBEAT_PATH = "/__heartbeat"
BYE_PATH = "/__bye"
WS_PATH = "/__ws"
INFO_PATH = "/__net/info"
CLOSE_GRACE = 2.0
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
WS_ROOM_RE = re.compile(r"^[A-Z0-9]{4,8}$")
MAX_WS_FRAME = 1024 * 1024

_rooms: dict[str, dict] = {}
_rooms_lock = threading.Lock()

ROOT = Path(__file__).resolve().parent
# Bind addresses that mean "every interface" and cannot be typed into a browser.
WILDCARD_HOSTS = {"0.0.0.0", "::", ""}
# Clash / TUN proxies commonly claim 198.18.0.0/15; it is not a LAN address
# another phone can dial, so keep it out of the share hint.
BENCHMARK_NET = ipaddress.ip_network("198.18.0.0/15")

_last_activity = time.monotonic()
_viewers: dict[str, float] = {}
_shutdown_deadline: float | None = None
_state_lock = threading.Lock()


def touch(viewer_id: str | None = None) -> None:
    global _last_activity, _shutdown_deadline
    now = time.monotonic()
    with _state_lock:
        _last_activity = now
        if viewer_id:
            _viewers[viewer_id] = now
            _shutdown_deadline = None


def leave(viewer_id: str | None) -> None:
    global _shutdown_deadline
    now = time.monotonic()
    with _state_lock:
        if viewer_id:
            _viewers.pop(viewer_id, None)
        if _viewers:
            _shutdown_deadline = None
        else:
            _shutdown_deadline = now + CLOSE_GRACE


def seconds_idle() -> float:
    with _state_lock:
        return time.monotonic() - _last_activity


def viewer_query(path: str) -> tuple[str, str | None]:
    parsed = urlparse(path)
    query = parse_qs(parsed.query)
    viewer = (query.get("id") or [None])[0]
    return parsed.path, viewer


def is_lan_ipv4(value: str) -> bool:
    try:
        addr = ipaddress.IPv4Address(value)
    except ValueError:
        return False
    return not (
        addr.is_loopback
        or addr.is_link_local
        or addr.is_multicast
        or addr.is_unspecified
        or addr in BENCHMARK_NET
    )


def local_ipv4s() -> list[str]:
    addresses: set[str] = set()
    try:
        for item in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = item[4][0]
            if is_lan_ipv4(ip):
                addresses.add(str(ipaddress.IPv4Address(ip)))
    except OSError:
        pass
    # WSL/Docker hostnames often resolve to nothing useful; hostname -I is
    # available on Linux and gives the container/WSL address for the hint.
    try:
        out = subprocess.check_output(["hostname", "-I"], text=True, timeout=0.5)
        for token in out.split():
            if is_lan_ipv4(token):
                addresses.add(str(ipaddress.IPv4Address(token)))
    except (OSError, subprocess.SubprocessError, ValueError):
        pass
    return sorted(addresses)


def running_in_wsl() -> bool:
    try:
        return "microsoft" in Path("/proc/version").read_text(errors="ignore").lower()
    except OSError:
        return False


def is_private_path(url_path: str) -> bool:
    """Dotfiles are not game assets. With --host 0.0.0.0 this keeps .git/
    (remotes, full history) off the LAN menu."""
    return any(part.startswith(".") for part in url_path.split("/") if part)


def make_ws_frame(opcode: int, payload: bytes) -> bytes:
    header = bytearray([0x80 | opcode])
    n = len(payload)
    if n < 126:
        header.append(n)
    elif n < 65536:
        header.append(126)
        header.extend(struct.pack("!H", n))
    else:
        header.append(127)
        header.extend(struct.pack("!Q", n))
    return bytes(header) + payload


def recv_exact(conn: socket.socket, n: int) -> bytes | None:
    chunks = bytearray()
    while len(chunks) < n:
        chunk = conn.recv(n - len(chunks))
        if not chunk:
            return None
        chunks.extend(chunk)
    return bytes(chunks)


def read_ws_text(conn: socket.socket, send_pong) -> str | None:
    """Read one complete text message. Only small JSON control frames are
    expected; continued frames are still handled for safety."""
    fragments: list[bytes] | None = None
    while True:
        head = recv_exact(conn, 2)
        if head is None:
            return None
        b1, b2 = head[0], head[1]
        fin = bool(b1 & 0x80)
        opcode = b1 & 0x0F
        masked = bool(b2 & 0x80)
        length = b2 & 0x7F
        if length == 126:
            raw = recv_exact(conn, 2)
            if raw is None:
                return None
            length = struct.unpack("!H", raw)[0]
        elif length == 127:
            raw = recv_exact(conn, 8)
            if raw is None:
                return None
            length = struct.unpack("!Q", raw)[0]
        if length > MAX_WS_FRAME:
            raise ValueError("websocket frame too large")
        mask = recv_exact(conn, 4) if masked else None
        if masked and mask is None:
            return None
        payload = recv_exact(conn, length)
        if payload is None:
            return None
        if mask:
            payload = bytes(byte ^ mask[i % 4] for i, byte in enumerate(payload))

        if opcode == 0x8:  # close
            return None
        if opcode == 0x9:  # ping
            send_pong(payload)
            continue
        if opcode == 0xA:  # pong
            continue
        if opcode in (0x1, 0x2):
            if fin:
                return payload.decode("utf-8", "replace")
            fragments = [payload]
        elif opcode == 0x0 and fragments is not None:
            fragments.append(payload)
            if fin:
                return b"".join(fragments).decode("utf-8", "replace")


class WSClient:
    def __init__(self, conn: socket.socket, room: str, role: str):
        self.conn = conn
        self.room = room
        self.role = role
        self.alive = True
        self.send_lock = threading.Lock()

    def send_frame(self, opcode: int, payload: bytes) -> None:
        if not self.alive:
            return
        with self.send_lock:
            try:
                self.conn.sendall(make_ws_frame(opcode, payload))
            except OSError:
                self.alive = False

    def send(self, obj: dict) -> None:
        self.send_frame(0x1, json.dumps(obj, separators=(",", ":")).encode("utf-8"))

    def recv_text(self) -> str | None:
        try:
            return read_ws_text(self.conn, lambda payload: self.send_frame(0xA, payload))
        except (OSError, ValueError, ConnectionError):
            return None

    def close(self) -> None:
        if not self.alive:
            return
        self.alive = False
        try:
            self.conn.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        try:
            self.conn.close()
        except OSError:
            pass


def ws_unregister(client: WSClient) -> None:
    other = None
    with _rooms_lock:
        room = _rooms.get(client.room)
        if not room:
            return
        if room.get("host") is client:
            room["host"] = None
            other = room.get("guest")
        elif room.get("guest") is client:
            room["guest"] = None
            other = room.get("host")
        room["choices"][client.role] = None
        room["inputs"][client.role].clear()
        if not room.get("host") and not room.get("guest"):
            _rooms.pop(client.room, None)
    if other is not None and other.alive:
        other.send({"type": "peer-left"})


def ws_send_pairs(room: dict) -> None:
    host = room.get("host")
    guest = room.get("guest")
    if not host or not guest:
        return
    with _rooms_lock:
        hi = room["inputs"]["host"]
        gi = room["inputs"]["guest"]
        ready_frames = sorted(set(hi) & set(gi))
        payloads = []
        for frame in ready_frames:
            payloads.append({
                "type": "frame",
                "frame": frame,
                "inputs": [hi.pop(frame), gi.pop(frame)],
            })
    for payload in payloads:
        host.send(payload)
        guest.send(payload)


def ws_message(client: WSClient, msg: dict) -> None:
    kind = msg.get("type")
    with _rooms_lock:
        room = _rooms.get(client.room)
    if not room:
        return

    if kind == "choice":
        char = str(msg.get("char") or "")[:24]
        with _rooms_lock:
            room["choices"][client.role] = char
            other = room.get("guest" if client.role == "host" else "host")
        if other is not None and other.alive:
            other.send({"type": "peer-choice", "role": client.role, "char": char})
        return

    if kind in ("start", "rematch") and client.role == "host":
        p1 = str(msg.get("p1") or "")[:24]
        p2 = str(msg.get("p2") or "")[:24]
        try:
            seed = int(msg.get("seed") or 0) & 0x7FFFFFFF
        except (TypeError, ValueError):
            seed = 0
        with _rooms_lock:
            guest = room.get("guest")
        if guest is not None and guest.alive:
            guest.send({"type": kind, "p1": p1, "p2": p2, "seed": seed})
        return

    if kind == "input":
        try:
            frame = int(msg.get("frame"))
        except (TypeError, ValueError):
            return
        if frame < 0 or frame > 10_000_000:
            return
        payload = msg.get("input")
        if not isinstance(payload, dict):
            return
        with _rooms_lock:
            room["inputs"][client.role][frame] = payload
        ws_send_pairs(room)
        return

    if kind == "leave":
        client.alive = False


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def do_GET(self) -> None:
        path, viewer = viewer_query(self.path)
        if path == WS_PATH:
            self.handle_websocket()
            return
        if path == HEARTBEAT_PATH:
            touch(viewer)
            self.send_response(204)
            self.end_headers()
            return
        if path == BYE_PATH:
            leave(viewer)
            self.send_response(204)
            self.end_headers()
            return
        if path == INFO_PATH:
            body = json.dumps({
                "addresses": local_ipv4s(),
                "port": self.server.server_address[1],
                "wsl": running_in_wsl(),
            }).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        touch()
        if is_private_path(path):
            self.send_error(404)
            return
        super().do_GET()

    def handle_websocket(self) -> None:
        key = self.headers.get("Sec-WebSocket-Key")
        upgrade = (self.headers.get("Upgrade") or "").lower()
        if not key or upgrade != "websocket":
            self.send_error(400, "WebSocket upgrade required")
            return
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        room_code = (query.get("room") or [""])[0].strip().upper()
        role = (query.get("role") or [""])[0].strip().lower()
        if not WS_ROOM_RE.fullmatch(room_code) or role not in ("host", "guest"):
            self.send_error(400, "Invalid room or role")
            return

        accept = base64.b64encode(
            hashlib.sha1((key + WS_GUID).encode("ascii")).digest()
        ).decode("ascii")
        self.send_response(101, "Switching Protocols")
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", accept)
        self.end_headers()
        self.close_connection = True

        client = WSClient(self.connection, room_code, role)
        with _rooms_lock:
            room = _rooms.get(room_code)
            if role == "host":
                if room is not None and room.get("host") is not None:
                    client.send({"type": "error", "message": "房间码已被占用"})
                    client.close()
                    return
                if room is None:
                    room = {
                        "host": None, "guest": None, "choices": {},
                        "inputs": {"host": {}, "guest": {}},
                    }
                    _rooms[room_code] = room
                room["host"] = client
            else:
                if room is None or room.get("host") is None or room.get("guest") is not None:
                    client.send({"type": "error", "message": "房间不存在或已满"})
                    client.close()
                    return
                room["guest"] = client
            other = room.get("guest" if role == "host" else "host")
            host = room.get("host")
            guest = room.get("guest")
            host_choice = room["choices"].get("host")
            guest_choice = room["choices"].get("guest")

        client.send({
            "type": "ready", "role": role, "room": room_code,
            "peer": other is not None,
        })
        if other is not None and other.alive:
            other.send({"type": "peer", "connected": True})
        if guest is not None and host_choice:
            guest.send({"type": "peer-choice", "role": "host", "char": host_choice})
        if host is not None and guest_choice:
            host.send({"type": "peer-choice", "role": "guest", "char": guest_choice})
        touch()

        try:
            while client.alive:
                text = client.recv_text()
                if text is None:
                    break
                touch()
                try:
                    msg = json.loads(text)
                except json.JSONDecodeError:
                    continue
                if isinstance(msg, dict):
                    ws_message(client, msg)
        finally:
            ws_unregister(client)
            client.close()

    def do_POST(self) -> None:
        path, viewer = viewer_query(self.path)
        if path == BYE_PATH:
            leave(viewer)
            self.send_response(204)
            self.end_headers()
            return
        touch()
        self.send_response(405)
        self.end_headers()

    def do_HEAD(self) -> None:
        touch()
        path, _ = viewer_query(self.path)
        if is_private_path(path):
            self.send_error(404)
            return
        super().do_HEAD()

    def log_message(self, fmt: str, *args: object) -> None:
        # Keep the console quiet; only startup/shutdown lines matter.
        path = self.path.split("?", 1)[0]
        if path in (HEARTBEAT_PATH, BYE_PATH, WS_PATH):
            return
        super().log_message(fmt, *args)


class IPv6ThreadingHTTPServer(http.server.ThreadingHTTPServer):
    """The stock server is IPv4-only, so an IPv6 --host would fail to bind."""

    address_family = socket.AF_INET6


def browser_url(host: str, port: int) -> str:
    """0.0.0.0 is a bind address; browsers need a concrete one to dial."""
    return f"http://{'127.0.0.1' if host in WILDCARD_HOSTS else host}:{port}/"


def say(message: str) -> None:
    """Status lines must appear even when stdout is redirected to a log file."""
    print(message, flush=True)


def idle_watchdog(server: http.server.ThreadingHTTPServer) -> None:
    while True:
        time.sleep(0.2)
        should_stop = False
        with _state_lock:
            now = time.monotonic()
            # Drop viewers whose browser disappeared without a bye beacon.
            for vid, seen in list(_viewers.items()):
                if now - seen > 12:
                    del _viewers[vid]
            if _shutdown_deadline is not None and now >= _shutdown_deadline:
                should_stop = True
            elif not _viewers and now - _last_activity >= IDLE_SECONDS:
                should_stop = True
        if should_stop:
            say("\n[server] no viewer — shutting down.")
            server.shutdown()
            return


def main() -> int:
    global IDLE_SECONDS
    parser = argparse.ArgumentParser(description="JOJO local game server")
    parser.add_argument("--host", default="127.0.0.1",
                        help="interface to bind; use 0.0.0.0 to expose the game on the LAN")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--idle", type=int, default=IDLE_SECONDS,
                        help="fallback seconds without a live viewer before shutdown")
    parser.add_argument("--no-autoclose", action="store_true",
                        help="keep serving after the last viewer leaves (stop with Ctrl+C)")
    parser.add_argument("--open", action="store_true", help="open the game in a browser")
    args = parser.parse_args()
    IDLE_SECONDS = max(3, args.idle)

    handler = functools.partial(Handler, directory=str(ROOT))
    server_class = (IPv6ThreadingHTTPServer if ":" in args.host
                    else http.server.ThreadingHTTPServer)
    try:
        server = server_class((args.host, args.port), handler)
    except OSError as exc:
        # A failed bind is a failure, even though there is nothing to clean up.
        say(f"[server] cannot bind {args.host}:{args.port}: {exc}")
        if args.open:
            webbrowser.open(browser_url(args.host, args.port))
        return 1

    server.daemon_threads = True
    touch()
    if args.no_autoclose:
        say("[server] auto-close off — press Ctrl+C to stop.")
    else:
        threading.Thread(target=idle_watchdog, args=(server,), daemon=True).start()

    url = browser_url(args.host, args.port)
    say(f"[server] listening on {args.host}:{args.port}")
    say(f"[server] {url}")
    if args.host in WILDCARD_HOSTS:
        say("[server] bound to every interface — anyone who can reach this machine can play.")
    if not args.no_autoclose:
        say("[server] closes as soon as the last viewer leaves.")
        say(f"[server] fallback idle timeout: {IDLE_SECONDS}s.")

    if args.open:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever(poll_interval=0.2)
    except KeyboardInterrupt:
        say("\n[server] stopped.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
