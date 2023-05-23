const express = require('express');
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const { authenticate } = require('@google-cloud/local-auth');
require('dotenv').config();

const app = express();
const port = 8080;

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://mail.google.com/',
];

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENTID,
  process.env.CLIENTSECRET,
  process.env.REDIRECTURL
);

app.get('/', async (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log(authUrl);
  res.redirect(authUrl); // Redirect to the authentication URL
});

app.get('/oauth2callback', async (req, res) => {
  
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
