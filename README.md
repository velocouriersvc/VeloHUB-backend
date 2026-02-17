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
src/
  ├── entities/      # TypeORM entities
  ├── migrations/    # Database migrations
  ├── routes/        # Express routes
  ├── data-source.ts # TypeORM configuration
  └── index.ts       # Application entry point
```
