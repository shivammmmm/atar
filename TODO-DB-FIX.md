# TODO: Fix MongoDB Connection

## Steps:
1. [x] Edit server.js to use local MongoDB URI (override Atlas)
2. [x] Kill existing server process if running (Ctrl+C) - new server started\n3. [x] Run `node server.js` in insurance-backend/\n4. [x] Verify log shows \"✅ MongoDB connected\"
5. [x] Test APIs: GET http://localhost:5000/api/policies (returned [])
6. [ ] [Optional] Test frontend integration
7. [ ] Revert for production Atlas (whitelist IP)
