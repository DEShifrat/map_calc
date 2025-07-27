import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';

dotenv.config(); // Load environment variables from .env

const app = express();
const PORT = process.env.PORT || 3001; // Backend will run on port 3001

app.use(cors({
  origin: 'http://localhost:8080', // Allow requests from your frontend
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json()); // For parsing application/json

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);

app.get('/', (req, res) => {
  res.send('BLE Mapping Backend API is running!');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});