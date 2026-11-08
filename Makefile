PATCH_IMAGE ?= excalidash-backend:library-check
PATCH_REVISION ?= $(shell git rev-parse HEAD)

.PHONY: check lint test image
check: lint test

lint:
	node --check backend/tests/library-scope-contract.mjs
	sh -n backend/tests/run-library-contract.sh
	git diff --check

image:
	docker build -f Dockerfile.library --build-arg PATCH_REVISION="$(PATCH_REVISION)" -t "$(PATCH_IMAGE)" .

test: image
	sh backend/tests/run-library-contract.sh "$(PATCH_IMAGE)"
