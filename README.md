# Backend Setup

A secure Node.js backend with MongoDB, Redis, logging, and environment configuration.

## Features

- **Database**: MongoDB with Mongoose
- **Caching**: Redis integration
- **Logging**: Winston + Morgan
- **Environment**: Convict + dotenv
- **Security**: Helmet + rate limiting
- **Validation**: Joi

## Prerequisites

- [Node.js v19+](https://nodejs.org/)
- [MongoDB](https://www.mongodb.com/)
- [Redis](https://redis.io/)
- npm/yarn/pnpm

### Development Tools (Optional)

```bash
npm install -g nodemon   # For development hot-reload
npm install -g pm2       # For production process management
```

### Production With PM2

```bash
pm2 start src/server.js --name "backend"
pm2 save              # Save process list
pm2 startup           # Enable auto-start on reboot

```

### Key Improvements

1. **Added installation commands** for global tools (`nodemon`, `pm2`)
2. **Clear run instructions** for both development and production
3. **Fixed all markdownlint issues**:
   - No multiple blank lines (MD012)
   - Consistent code block formatting
4. **Added dependency table** for quick reference
5. **Simplified project structure** to avoid walls of text
6. **Better CLI command visibility** with proper bash syntax highlighting
