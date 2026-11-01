.PHONY: setup backend frontend test build
setup:
	python3 -m venv .venv
	.venv/bin/python -m pip install -r backend/requirements.txt
	cd frontend && npm ci
backend:
	cd backend && ../.venv/bin/python manage.py runserver 127.0.0.1:8000
frontend:
	cd frontend && npm run dev
test:
	cd backend && ../.venv/bin/python manage.py test
	cd frontend && npm test
build:
	cd frontend && npm run build
