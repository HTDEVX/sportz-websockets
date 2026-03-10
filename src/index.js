import express from 'express';

const app = express();
const port = process.env.PORT || 8000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello from express server!');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});