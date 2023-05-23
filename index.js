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
  const code = req.query.code; // Get the authorization code from the query parameters
  try {
    const { tokens } = await oauth2Client.getToken(code); // Exchange the authorization code for access and refresh tokens
    oauth2Client.setCredentials(tokens); // Set the credentials for future API calls
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client }); // Create the Gmail API client

    // Retrieve email address
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const emailAddress = profile.data.emailAddress;
    console.log('Email Address:', emailAddress);

    // Check if the "vacation" label exists or create it
    let vacationLabel;
    try {
      const labelsResponse = await gmail.users.labels.list({ userId: 'me' });
      const labels = labelsResponse.data.labels;
      vacationLabel = labels.find(label => label.name === 'vacation');
      if (!vacationLabel) {
        vacationLabel = await gmail.users.labels.create({
          userId: 'me',
          requestBody: {
            name: 'vacation',
            labelListVisibility: 'labelShow',
            messageListVisibility: 'show',
          },
        });
        console.log(`Created "${vacationLabel.name}" label with ID: ${vacationLabel.id}`);
      } else {
        console.log(`"${vacationLabel.name}" label already exists`);
      }
    } catch (error) {
      console.error(`Error creating or retrieving the "vacation" label: ${error.message}`);
    }

    // Set to store sent email IDs
    const sentEmails = new Set();

    // Start periodic check for unread emails and sending auto replies
    setInterval(async () => {
      try {
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: 'is:unread',
        });
        const messages = response.data.messages;
        console.log('Unread Emails:', messages);

        // Apply the "vacation" label to unread emails and send auto replies
        for (const message of messages) {
          try {
            const email = await gmail.users.messages.get({
              userId: 'me',
              id: message.id,
              format: 'full',
            });
            const headers = email.data.payload.headers;
            const fromHeader = headers.find(header => header.name.toLowerCase() === 'from');
            const senderEmail = fromHeader.value;

            // Check if auto reply has already been sent to this sender
            if (sentEmails.has(senderEmail)) {
              console.log(`Auto reply already sent to sender: ${senderEmail}`);
              continue; // Skip sending the auto reply
            }

            await gmail.users.messages.modify({
              userId: 'me',
              id: message.id,
              requestBody: {
                addLabelIds: [vacationLabel.id],
              },
            });
            console.log(`Applied "${vacationLabel.name}" label to email with ID: ${message.id}`);

            // Send auto reply to the sender
            const reply = {
              userId: 'me',
              requestBody: {
                raw: createAutoReply(email.data, senderEmail),
              },
              threadId: email.data.threadId, // Reply within the same thread
            };
            await gmail.users.messages.send(reply);
            console.log('Auto reply sent to sender:', senderEmail);

            // Store the sent email ID in the set
            sentEmails.add(senderEmail);
          } catch (error) {
            console.error(`Error applying label or sending auto reply for email with ID ${message.id}: ${error.message}`);
          }
        }
      } catch (error) {
        console.error(`Error retrieving unread emails: ${error.message}`);
      }
    }, getRandomInterval(5, 10) * 1000);

    res.send("Auto reply process started.");
  } catch (error) {
    console.error("Error retrieving access token:", error);
    res.status(500).send("Error retrieving access token.");
  }
});

// Function to generate a random interval between min and max (inclusive)
function getRandomInterval(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Function to create the auto reply message
function createAutoReply(message, senderEmail) {
  const autoReplyMessage = `
    Hello,

    I am currently on vacation and will have limited access to my email.
    If your message requires immediate attention, please contact someone else in my absence.

    Thank you,
    ${senderEmail}
  `;

  const encodedMessage = Buffer.from(autoReplyMessage).toString('base64');

  // Get the recipient email address
  const headers = message.payload.headers;
  const toHeader = headers.find(header => header.name.toLowerCase() === 'to');
  const recipientEmail = toHeader.value;

  // Create the auto reply message with the recipient address
  const autoReply = `To: ${recipientEmail}\r\n`
                  + `Subject: Auto Reply\r\n`
                  + `Content-Type: text/plain; charset=utf-8\r\n\r\n`
                  + autoReplyMessage;

  const encodedAutoReply = Buffer.from(autoReply).toString('base64');
  return encodedAutoReply;
}

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
