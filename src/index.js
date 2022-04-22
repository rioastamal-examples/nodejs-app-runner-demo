const { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand, UpdateItemCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');
const express = require("express");

const app = express();
const uuid = require('uuid');
const ddbclient = new DynamoDBClient({ region: process.env.APP_REGION || 'us-east-1' });
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const tableName = process.env.APP_TABLE_NAME || '';
const appToken = process.env.APP_TOKEN || '';
const appVersion = '1.0';

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
class NotFoundError extends Error {}

function authAdminMiddleware(req, res, next) {
  const authHeader = req.get('authorization') ? req.get('authorization').split(' ')[1] : undefined;
  const token = authHeader || req.query.access_token || '';
  
  if (!token) {
    res.status(401).send({ message: 'Missing API token.' });
    return;
  }
  
  console.log({ 'Token': token, 'appToken': appToken });
  if (token !== appToken) {
    res.status(401).send({ message: 'Token missmatch.' });
    return;
  }
  
  next();
}

async function queryExistingRecordsByGSI(params) {
  const paramAttributeValues = { ':sk': params.sk };
  const paramAttributeNames = {};
  const paramConditionExpression = [ 'sk = :sk ' ];
  
  if (params.data) {
    paramAttributeValues[':data'] = params.data;
    paramAttributeNames['#data'] = 'data';
    paramConditionExpression.push('begins_with(#data, :data)');
  }
  
  const existingUserParam = {
    TableName: tableName,
    IndexName: 'data-index',
    KeyConditionExpression: paramConditionExpression.join(' and '),
    ExpressionAttributeValues: marshall(paramAttributeValues),
    Limit: params.limit || 1
  };
  
  if (params.data) {
    existingUserParam['ExpressionAttributeNames'] = paramAttributeNames;
  }
  
  console.log('existingUserParam =>', existingUserParam);
  const existingUserResponse = await ddbclient.send(new QueryCommand(existingUserParam));
  
  return existingUserResponse;
}

// Create new user endpoint
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

app.put('/users/:id', authAdminMiddleware, async (req, res) => {
try {
    const userId = req.params.id || '';
    
    const userParam = {
      TableName: tableName,
      Key: marshall({
        pk: `user#${userId}`,
        sk: 'user'
      })
    };
    
    const userResponse = await ddbclient.send(new GetItemCommand(userParam));
    if (userResponse.Item === undefined) {
      throw new NotFoundError('User id not found.');
    }
    
    if (req.params.hasOwnProperty('verified') && typeof req.params.verified !== "boolean") {
      throw new BadRequestError('Verified should be boolean true or false.');
    }
    
    const userItem = unmarshall(userResponse.Item);
    const fullname = req.body.fullname || userItem.fullname;
    const verified = req.body.verified || userItem.verified;
    const now = new Date().toISOString();
    
    const updateExpression = [
      '#fullname = :fullname',
      '#verified = :verified',
      '#updated_at = :updated_at',
    ];
    const expressionAttributes = {
      '#fullname': 'fullname',
      '#verified': 'verified',
      '#updated_at': 'updated_at'
    };
    const expressionValues = {
      ':fullname': fullname,
      ':verified': verified,
      ':updated_at': now
    }
    
    if (verified === true) {
      updateExpression.push('#verified_date = :verified_date');
      expressionAttributes['#verified_date'] = 'verified_date';
      expressionValues[':verified_date'] = now;
    }
    
    const updateUserParam = {
      TableName: tableName,
      Key: marshall({
        pk: userItem.pk,
        sk: 'user'
      }),
      UpdateExpression: 'SET ' + updateExpression.join(','),
      ExpressionAttributeNames: expressionAttributes,
      ExpressionAttributeValues: marshall(expressionValues)
    };
    
    console.log('updateUserParam =>', updateUserParam);
    await ddbclient.send(new UpdateItemCommand(updateUserParam));
    
    res.json({
      id: userItem.pk.replace('user#', ''),
      email: userItem.email,
      fullname: fullname,
      verified: verified,
      created_at: userItem.created_at,
      updated_at: now
    });
  } catch (e) {
    if (e instanceof NotFoundError) {
      res.status(404).json({
        message: e.toString()
      });
      
      return;      
    }
    
    res.status(500).json({
      message: e.toString()
    });
  }  
});

// View a user endpoint
app.get('/users/:id', authAdminMiddleware, async (req, res) => {
  try {
    const userId = req.params.id || '';
    
    const userParam = {
      TableName: tableName,
      Key: marshall({
        pk: `user#${userId}`,
        sk: 'user'
      })
    };
    
    const userResponse = await ddbclient.send(new GetItemCommand(userParam));
    if (userResponse.Item === undefined) {
      throw new NotFoundError('User id not found.');
    }
    
    const userItem = unmarshall(userResponse.Item);
    res.json({
      id: userItem.pk.replace('user#', ''),
      email: userItem.email,
      fullname: userItem.fullname,
      verified: userItem.verified,
      created_at: userItem.created_at,
      updated_at: userItem.updated_at
    });
  } catch (e) {
    if (e instanceof NotFoundError) {
      res.status(404).json({
        message: e.toString()
      });
      
      return;      
    }
    
    res.status(500).json({
      message: e.toString()
    });
  }
});

app.get('/users', authAdminMiddleware, async (req, res) => {
  try {
    const email = req.query.email || '';
    const queryParam = {
      sk: 'user',
      limit: 50
    };
    if (email) { queryParam['data'] = decodeURIComponent(email); }
    
    const userResponse = await queryExistingRecordsByGSI(queryParam);
    
    const users = [];
    for (let item of userResponse.Items) {
      const userItem = unmarshall(item);
      users.push({
        id: userItem.pk.replace('user#', ''),
        email: userItem.email,
        fullname: userItem.fullname,
        verified: userItem.verified,
        created_at: userItem.created_at,
        updated_at: userItem.updated_at
      });
    }
    
    res.json(users);
  } catch (e) {
    res.status(500).json({
      message: e.toString()
    });    
  }
});

app.delete('/users/:id', authAdminMiddleware, async (req, res) => {
  try {
    const userId = req.params.id || '';
    
    const userParam = {
      TableName: tableName,
      Key: marshall({
        pk: `user#${userId}`,
        sk: 'user'
      })
    };

    const userResponse = await ddbclient.send(new GetItemCommand(userParam));
    if (userResponse.Item === undefined) {
      throw new NotFoundError('User id not found.');
    }

    await ddbClient.send(new DeleteItemCommand(userParam));
    console.log('Success, deleted user');
    
    res.status(200).json({
      message: 'Success, deleted user'
    });
  } catch (e) {
    if (e instanceof NotFoundError) {
      res.status(404).json({
        message: e.toString()
      });
      
      return;      
    }
    
    res.status(500).json({
      message: e.toString()
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    app: 'Node.js Api Demo',
    version: appVersion,
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