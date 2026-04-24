const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const { MongoMemoryServer } = require('mongodb-memory-server');

const auth = require('../controllers/auth');
const User = require('../models/User');

// Mock database connection
jest.mock('../config/db', () => jest.fn());

const app = express();
app.use(express.json());

// Mock protect middleware
const mockProtect = (req, res, next) => {
    const userId = req.headers['user-id'];
    if (userId) {
        req.user = { id: userId };
    }
    next();
};

// Routes
app.post('/api/v1/auth/register', auth.register);
app.post('/api/v1/auth/login', auth.login);
app.get('/api/v1/auth/logout', auth.logout);
app.get('/api/v1/auth/me', mockProtect, auth.getMe);
app.put('/api/v1/auth/updatedetails', mockProtect, auth.updateDetails);
app.put('/api/v1/auth/updatepassword', mockProtect, auth.updatePassword);
app.get('/api/v1/auth/users', auth.getUsers);
app.delete('/api/v1/auth/users/:id', auth.deleteUser);

let mongoServer;

const sampleUser = {
    name: 'John Doe',
    email: 'john@gmail.com',
    tel: '0123456789',
    password: 'password123',
    role: 'user'
};

beforeAll(async () => {
    process.env.JWT_SECRET = 'test_secret';
    process.env.JWT_EXPIRE = '1d';
    process.env.JWT_COOKIE_EXPIRE = '1';
    process.env.NODE_ENV = 'test';

    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

afterEach(async () => {
    await User.deleteMany({});
    jest.restoreAllMocks();
    jest.clearAllMocks();
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

describe('Auth Controller (100% Branch Coverage)', () => {
    // REGISTER
    describe('Register', () => {

        it('should register user and set secure cookie in production', async () => {
            process.env.NODE_ENV = 'production';

            const res = await request(app)
                .post('/api/v1/auth/register')
                .send(sampleUser);

            expect(res.statusCode).toBe(200);
            expect(res.headers['set-cookie'][0]).toMatch(/Secure/);
        });

        it('should hit register catch block (validation error)', async () => {
            const res = await request(app)
                .post('/api/v1/auth/register')
                .send({ name: 'only-name' });

            expect(res.statusCode).toBe(400);
        });
    });

    //LOGIN
    describe('Login', () => {

        it('should return 400 if email or password missing', async () => {
            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({ email: 'only@email.com' });

            expect(res.statusCode).toBe(400);
        });

        it('should return 400 if user not found (real DB case)', async () => {
            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({ email: 'none@test.com', password: '123' });

            expect(res.statusCode).toBe(400);
        });

        it('should return 400 when select() resolves to null (mocked branch)', async () => {
            const spy = jest.spyOn(User, 'findOne').mockImplementationOnce(() => ({
                select: () => Promise.resolve(null)
            }));

            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({ email: 'ghost@test.com', password: '123' });

            expect(res.statusCode).toBe(400);

            spy.mockRestore();
        });

        it('should return 401 if password is incorrect', async () => {
            await User.create(sampleUser);

            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({ email: sampleUser.email, password: 'wrongpassword' });

            expect(res.statusCode).toBe(401);
        });
    });

    //GET ME
    it('should get current user profile', async () => {
        const user = await User.create(sampleUser);

        const res = await request(app)
            .get('/api/v1/auth/me')
            .set('user-id', user._id.toString());

        expect(res.statusCode).toBe(200);
    });

    //LOGOUT
    it('should logout and clear cookie', async () => {
        const res = await request(app).get('/api/v1/auth/logout');

        expect(res.statusCode).toBe(200);
        expect(res.headers['set-cookie'][0]).toMatch(/token=none/);
    });

    // UPDATE DETAILS
    describe('Update Details', () => {

        it('should update user successfully', async () => {
            const user = await User.create(sampleUser);

            const res = await request(app)
                .put('/api/v1/auth/updatedetails')
                .set('user-id', user._id.toString())
                .send({ name: 'Updated Name' });

            expect(res.statusCode).toBe(200);
        });

        it('should hit validation error (mongoose)', async () => {
            const user = await User.create(sampleUser);

            const res = await request(app)
                .put('/api/v1/auth/updatedetails')
                .set('user-id', user._id.toString())
                .send({ email: 'invalid-email' });

            expect(res.statusCode).toBe(400);
        });

        it('should hit catch block when DB fails', async () => {
            const user = await User.create(sampleUser);

            const spy = jest.spyOn(User, 'findByIdAndUpdate')
                .mockImplementationOnce(() => Promise.reject(new Error('DB FAIL')));

            const res = await request(app)
                .put('/api/v1/auth/updatedetails')
                .set('user-id', user._id.toString())
                .send({ name: 'Fail' });

            expect(res.statusCode).toBe(400);
            expect(res.body.message).toBe('DB FAIL');

            spy.mockRestore();
        });
    });

    // UPDATE PASSWORD
    describe('Update Password', () => {

        it('should update password successfully', async () => {
            const user = await User.create(sampleUser);

            const res = await request(app)
                .put('/api/v1/auth/updatepassword')
                .set('user-id', user._id.toString())
                .send({ currentPassword: 'password123', newPassword: 'newpass' });

            expect(res.statusCode).toBe(200);
        });

        it('should return 400 if fields missing', async () => {
            const user = await User.create(sampleUser);

            const res = await request(app)
                .put('/api/v1/auth/updatepassword')
                .set('user-id', user._id.toString())
                .send({ currentPassword: 'password123' });

            expect(res.statusCode).toBe(400);
        });

        it('should return 500 if internal error occurs', async () => {
            const user = await User.create(sampleUser);

            jest.spyOn(User.prototype, 'matchPassword')
                .mockImplementationOnce(() => { throw new Error(); });

            const res = await request(app)
                .put('/api/v1/auth/updatepassword')
                .set('user-id', user._id.toString())
                .send({ currentPassword: 'password123', newPassword: 'newpass' });

            expect(res.statusCode).toBe(500);
        });
    });

    // ADMIN
    describe('Admin', () => {

        it('should get all users', async () => {
            await User.create(sampleUser);

            const res = await request(app).get('/api/v1/auth/users');

            expect(res.statusCode).toBe(200);
        });

        it('should hit getUsers catch block', async () => {
            jest.spyOn(User, 'find').mockImplementationOnce(() => {
                throw new Error();
            });

            const res = await request(app).get('/api/v1/auth/users');

            expect(res.statusCode).toBe(500);
        });

        it('should delete user successfully', async () => {
            const user = await User.create(sampleUser);

            const res = await request(app)
                .delete(`/api/v1/auth/users/${user._id}`);

            expect(res.statusCode).toBe(200);
        });

        it('should return 404 if user not found', async () => {
            const fakeId = new mongoose.Types.ObjectId();

            const res = await request(app)
                .delete(`/api/v1/auth/users/${fakeId}`);

            expect(res.statusCode).toBe(404);
        });

        it('should hit delete catch block', async () => {
            const res = await request(app)
                .delete('/api/v1/auth/users/invalid-id');

            expect(res.statusCode).toBe(500);
        });
    });

    // MODEL BRANCH
    it('should skip password hashing if not modified', async () => {
        const user = await User.create(sampleUser);

        const fetched = await User.findById(user._id);
        fetched.name = 'Updated';

        const saved = await fetched.save();

        expect(saved.password).toBe(user.password);
    });

});