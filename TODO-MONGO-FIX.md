# Fix MongoDB Connection Issue

**Status:** In Progress

## Steps:

- [x] 1. Edit insurance-backend/server.js - Force local URI (Atlas IP issue), proper logging/error handling
- [ ] 2. Start MongoDB service (MongoDB Community Server or `mongod`)
- [ ] 3. cd insurance-backend && node server.js - Verify "✅ MongoDB connected" log
- [ ] 4. Test GET http://localhost:5000/api/policies (expect [])
- [ ] 5. Test frontend policy list loads
- [ ] 6. Mark complete

**Instructions:**

- Ensure MongoDB is installed/running on localhost:27017
- .env MONGODB_URI optional (falls back to local)
- Kill any existing server before restart
