const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const routes = require('./routes');
const path = require('path');

const app = express();

const corsOptions = {
  origin: ['http://localhost:5173', 'https://billinginvoices.netlify.app'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api', routes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

module.exports = app;