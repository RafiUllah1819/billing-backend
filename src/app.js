const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const routes = require('./routes');
const path = require('path');

const app = express();

/* Allowed Frontend Origins */
const allowedOrigins = [
  'http://localhost:5173',
  'https://billinginvoices.netlify.app'
];

/* CORS Configuration */
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

/* Handle Preflight Requests */
app.options('*', cors());

/* Security & Logging */
app.use(
  helmet({
    crossOriginResourcePolicy: false
  })
);

app.use(morgan('dev'));

/* Body Parsing */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* Static Files */
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* API Routes */
app.use('/api', routes);

/* 404 Handler */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

module.exports = app;