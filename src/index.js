const { DynamoDBClient, GetItemCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const express = require("express");

const app = express();
const ddbclient = new DynamoDBClient({ region: process.env.APP_REGION || 'us-east-1' });
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const tableName = process.env.APP_TABLE_NAME || 'astamal-serverless-demo-5zzpka';

// Allow CORS
app.use((req, res, next) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true
  });
  
  next();
});

app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    app: 'Node.js Api Demo',
    env: process.env.NODE_ENV || ''
  })
});

app.get('/ping', (req, res) => {
  res.json('pong');
});

const port = process.env.NODE_PORT || 8080;
app.listen(port, () => {
  console.log(`API running on port ${port}`);
});