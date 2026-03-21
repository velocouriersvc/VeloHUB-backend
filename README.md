# Velo Backend

Express TypeScript backend with TypeORM and PostgreSQL.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

3. Update the `.env` file with your PostgreSQL credentials.

4. Make sure PostgreSQL is running and the `velo` database exists:
```bash
createdb velo
```

5. Run the development server:
```bash
npm run dev
```

The server will start on `http://localhost:3000`

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build the project
- `npm start` - Start production server

## Project Structure

```
docs/              # Documentation
src/               # Source code
  ├── entities/      # TypeORM entities
  ├── migrations/    # Database migrations
  ├── routes/        # Express routes
  ├── data-source.ts # TypeORM configuration
  └── index.ts       # Application entry point
```

## Documentation

Detailed documentation can be found in the [docs/](docs/) folder:
- [API Reference](docs/API_REFERENCE.md)
- [Deployment Guide](docs/DEPLOYMENT_README.md)
- [Marketplace Plan](docs/MARKETPLACE_PLAN.md)
- [Marketplace Progress](docs/MARKETPLACE_PROGRESS.md)
- [Monitoring](docs/MONITORING.md)
- [Payment Provider Architecture](docs/PAYMENT_PROVIDER_ARCHITECTURE.md)
- [Twilio Console Guide](docs/TWILIO_CONSOLE_GUIDE.md)
- [VPS Setup](docs/VPS_SETUP.md)
- [K8S Email Setup](docs/K8S_EMAIL_SETUP.md)
- [System & Logistics Guide](docs/Velo%20Marketplace%20-%20System%20&%20Logistics%20Guide.md)
