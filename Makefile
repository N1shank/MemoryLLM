.PHONY: dev server client install clean

dev:
	@echo "Starting backend and frontend..."
	@make -j 2 server client

server:
	@echo "Starting server..."
	cd server && source venv/bin/activate && uvicorn app.main:app --reload --port 8000

client:
	@echo "Starting client..."
	cd client && npm run dev

install:
	@echo "Installing dependencies..."
	cd server && python3 -m venv venv && source venv/bin/activate && pip install -e .
	cd client && npm install

clean:
	@echo "Cleaning up..."
	find . -type d -name "__pycache__" -exec rm -rf {} +
	rm -rf server/venv client/node_modules
