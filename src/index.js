const { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand } = require('@aws-sdk/client-dynamodb');
const express = require("express");

const app = express();
const uuid = require('uuid');
const ddbclient = new DynamoDBClient({ region: process.env.APP_REGION || 'us-east-1' });
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const tableName = process.env.APP_TABLE_NAME || 'astamal-serverless-demo-5zzpka';
const appToken = process.env.APP_TOKEN || '';

// Allow CORS
app.use((req, res, next) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true
  });
  
  next();
});

// Process request as JSON Content-Type
app.use(express.json());

// Custom error
class BadRequestError extends Error {}

async function queryExistingRecordsByGSI(params) {
  const existingUserParam = {
    TableName: tableName,
    IndexName: 'data-index',
    KeyConditionExpression: 'sk = :sk and begins_with(#data, :data)',
    ExpressionAttributeNames: {
      '#data': 'data'
    },
    ExpressionAttributeValues: marshall({
      ':sk': params.sk,
      ':data': params.data
    }),
    Limit: params.limit || 1
  };
  const existingUserResponse = await ddbclient.send(new QueryCommand(existingUserParam));
  
  return existingUserResponse;
}

app.post('/users', async (req, res) => {
  const email = req.body.email || '';
  const fullname = req.body.fullname || '';
  
  try {
    if (! email) {
      throw new BadRequestError('Email is required.');
    }
    if (! fullname) {
      throw new BadRequestError('Full name is required.');
    }
    
    const existingUserResponse = await queryExistingRecordsByGSI({
      sk: 'user',
      data: `${email}#`
    });
    
    if (existingUserResponse.Count > 0) {
      throw new BadRequestError('Email already exists.');
    }
    
    const now = new Date();
    
    // Used for GSI (Global Secondary Index)
    const dateNoTime = now.toISOString().substr(0, 10);
    const gsiData = `${email}#${dateNoTime}`;
    
    const userId = uuid.v4();
    const userItem = {
      pk: `user#${userId}`,
      sk: 'user',
      data: gsiData,
      email: email,
      fullname: fullname,
      roles: ['user'],
      verified: false,
      verified_date: null,
      updated_at: now.toISOString(),
      created_at: now.toISOString()
    }
    const userParam = {
      TableName: tableName,
      Item: marshall(userItem),
      ConditionExpression: 'NOT begins_with(email, :email)',
      ExpressionAttributeValues: marshall({ ':email': email })
    };
    
    console.log('userParam =>', userParam);
    
    const cmdPutItemCommand = new PutItemCommand(userParam);
    await ddbclient.send(cmdPutItemCommand);
    
    res.status(201).json({
      id: userId,
      email: email,
      fullname: fullname,
      verified: false,
      created_at: userItem.created_at,
      meta: {
        location: `/users/${userId}`
      }
    });
  } catch (e) {
    if (e instanceof BadRequestError) {
      res.status(400).json({
        message: e.toString()
      });
      
      return;
    }
    
    res.status(500).json({
      message: e.toString()
    });
  }
});

app.put('/users/:id', (req, res) => {
  
});

app.get('/users/:id', (req, res) => {
  
});

app.delete('/users/:id', (req, res) => {
  
});

app.get('/', (req, res) => {
  res.json({
    app: 'Node.js Api Demo',
    env: process.env.NODE_ENV || ''
  });
});

app.get('/ping', (req, res) => {
  res.json('pong');
});

const port = process.env.NODE_PORT || 8080;
app.listen(port, () => {
  console.log(`API running on port ${port}`);
});