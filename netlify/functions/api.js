// netlify/functions/api.js
const path = require('path');

// Import Next.js API handlers
const submitBooking = require('../../src/pages/api/submit-booking');
const calendarEvents = require('../../src/pages/api/calendar-events');

exports.handler = async (event, context) => {
  const { path: requestPath, httpMethod, body, queryStringParameters } = event;
  
  // Create mock Next.js request and response objects
  const req = {
    method: httpMethod,
    query: queryStringParameters || {},
    body: body ? JSON.parse(body) : {},
    url: requestPath,
  };
  
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      this.headers['Content-Type'] = 'application/json';
      this.body = JSON.stringify(data);
      return this;
    },
    setHeader: function(name, value) {
      this.headers[name] = value;
    }
  };
  
  try {
    // Route to appropriate handler based on path
    if (requestPath.includes('/submit-booking')) {
      await submitBooking.default(req, res);
    } else if (requestPath.includes('/calendar-events')) {
      await calendarEvents.default(req, res);
    } else {
      res.status(404).json({ error: 'Not found' });
    }
    
    return {
      statusCode: res.statusCode,
      headers: res.headers,
      body: res.body,
    };
  } catch (error) {
    console.error('Netlify function error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
