# Implement Authentication System

**Status:** In Progress

## Steps:

- [ ] 1. Backend deps: npm i bcryptjs jsonwebtoken
- [ ] 2. Create insurance-backend/models/User.js (email, hashed pass, role)
- [ ] 3. Edit insurance-backend/server.js (JWT secret, default admin create, auth middleware, /api/auth/login & /me, protect /api/policies & /api/convert)
- [ ] 4. Restart backend: cd insurance-backend && npm start - login admin@test.com / password
- [ ] 5. Frontend: Edit frontend/src/App.jsx to protect routes (redirect unauth to /login)
- [ ] 6. Frontend dev: cd frontend && npm run dev - test login → dashboard
- [x] 7. Mark complete

**Notes:**

- JWT secret: 'supersecretchangeinprod'
- Default user: admin@test.com / password (hashed)
- APIs protected except /health, /uploads
