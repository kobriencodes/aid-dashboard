.PHONY: build-data health checkpoints borders

build-data: health checkpoints borders

health:
	python -m backend.pipelines.health_facilities

checkpoints:
	python -m backend.pipelines.checkpoints

borders:
	python -m backend.pipelines.borders