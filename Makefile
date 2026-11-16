# Thin convenience wrapper; the actual logic lives in run.sh.
PYTHON ?= python3
HOST   ?= 127.0.0.1
PORT   ?= 8080
IDLE   ?= 120

.PHONY: run help

run:
	HOST=$(HOST) PORT=$(PORT) IDLE=$(IDLE) PYTHON=$(PYTHON) ./run.sh $(ARGS)

help:
	@printf 'make run [HOST=0.0.0.0] [PORT=8080] [IDLE=120]\n'
	@printf 'make run ARGS="--no-autoclose"\n'
