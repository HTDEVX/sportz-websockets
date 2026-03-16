import express from 'express';
import { matchesRouter } from './routes/matches.js';

const app = express();
const port = process.env.PORT || 8000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello from express server!');
});

app.use('/matches', matchesRouter);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});