## About

This project contains example how to deploy simple Node.js API to [AWS App Runner](https://aws.amazon.com/apprunner/) using Terraform.

> AWS App Runner is a fully managed service that makes it easy for developers to quickly deploy containerized web applications and APIs, at scale and with no prior infrastructure experience required. (aws.amazon.com)

The sample API is a simple API that doing CRUD to users data that stored in Amazon DynamoDB. To protect the API it uses simple token verification.

This repo shows you how to deploy from GitHub repository. If you want example how to deploy using Container image please refer to [golang-app-runner-demo](https://github.com/rioastamal-examples/golang-app-runner-demo) repository.

## Presentation

You can watch my talk at AWS User Group Medan about how to deploy Node.js API on AWS App Runner. The talk is in Bahasa Indonesia.

[![Watch the video](https://img.youtube.com/vi/RRf4TbcozWg/hqdefault.jpg)](https://youtu.be/RRf4TbcozWg)

## Requirements

This project has been tested using following softwares version, but it should works with other version too.

- AWS CLI v2.4.28
- Bash v4.2.46
- Terraform v1.1.7
- Node.js 14.x
- GitHub account

## How to run

Fork this repository and clone from your own forked GitHub repository. 

```sh
$ git clone git@github.com:YOUR_ACCOUNT/nodejs-app-runner-demo.git
```

Try to work from `development` branch.

```sh
$ git checkout -b development origin/development
```

Go to `terraform/` directory.

```sh
$ cd nodejs-app-runner-demo/terraform
```

Copy sample variable file `development.tfvars.example` into `development.tfvars`.

```sh
$ cp development.tfvars.example development.tfvars
```

Below are list of Terraform variables that you can configure. Not all region having AWS App Runner service, make sure to select correct region.

- app_name (default: "nodejs-api")
- app_env (default: "development")
- app_git_url (default: "YOUR_GITHUB_REPO_URL")
- app_token (default: "YOUR_TOKEN")
- app_branch (default: "development")
- app_port (default: "8080")
- region (default: "us-east-1")
- tags
  - env = "demo"
  - app = "nodejs-app-runner-demo"
  - fromTerraform = true

Run Terraform initialization then apply to create all AWS resources. Make sure you already configure your AWS CLI credentials before running command below. By default it will all the resources in `us-east-1` region.

```sh
$ terraform init
$ terraform apply -var-file development.tfvars
```

It may take several minutes to complete. When it is done you can go to your AWS App Runner Management Console to see the service. You will be given default domain inform of something like `https://RANDOM_CHARS.us-east-1.awsapprunner.com/`.

## Accessing API

There are severals available APIs:

- `POST /users`
- `GET /users`
- `GET /users/:id`
- `PUT /users/:id`

### Register new user API

```sh
$ curl -XPOST -H "Content-Type: application/json" \
https://RANDOM_CHARS.us-east-1.awsapprunner.com/users \
-d '{
 "email": "john@example.com",
 "fullname": "John Doe"
}'
```

```json
{
  "id": "f456ccd5-440c-4618-aa2e-3d63f4e0d2a4",
  "email": "john@example.com",
  "fullname": "John Doe",
  "verified": false,
  "created_at": "2022-04-21T22:55:46.769Z",
  "meta": {
    "location": "/users/f456ccd5-440c-4618-aa2e-3d63f4e0d2a4"
  }
}
```

### Get all users API

```sh
$ curl -H "Authorization: Bearer YOUR_TOKEN" \
https://RANDOM_CHARS.us-east-1.awsapprunner.com/users
```

```json
[
  {
    "id": "d5d1cce5-12a2-4027-823a-0e8643ab6be1",
    "email": "john@example.com",
    "fullname": "John Doe",
    "verified": true,
    "created_at": "2022-04-21T07:54:18.015Z",
    "updated_at": "2022-04-21T19:04:07.974Z"
  },
  {
    "id": "bcf40177-e475-4de7-b9be-74fba0346368",
    "email": "john+2@example.com",
    "fullname": "John Doe 2nd",
    "verified": false,
    "created_at": "2022-04-21T08:13:03.093Z",
    "updated_at": "2022-04-21T08:13:03.093Z"
  }
]
```

### Get single user API

```sh
$ curl -H "Authorization: Bearer YOUR_TOKEN" \
https://RANDOM_CHARS.us-east-1.awsapprunner.com/users/d5d1cce5-12a2-4027-823a-0e8643ab6be1
```

```json
{
  "id": "d5d1cce5-12a2-4027-823a-0e8643ab6be1",
  "email": "john@example.com",
  "fullname": "John Doe",
  "verified": true,
  "created_at": "2022-04-21T07:54:18.015Z",
  "updated_at": "2022-04-21T19:04:07.974Z"
}
```

### Update user API

```sh
$ curl -XPUT -H "Authorization: Bearer YOUR_TOKEN" \
-H "Content-Type: application/json" \
https://RANDOM_CHARS.us-east-1.awsapprunner.com/users/d5d1cce5-12a2-4027-823a-0e8643ab6be1 \
-d '{
  "fullname": "John Doe First",
  "verified": true"
}'
```

```json
{
  "id": "d5d1cce5-12a2-4027-823a-0e8643ab6be1",
  "email": "john@example.com",
  "fullname": "John Doe",
  "verified": true,
  "created_at": "2022-04-21T07:54:18.015Z",
  "updated_at": "2022-04-21T19:04:07.974Z"
}
```

## Deploying new version

To deploy new version of the app what you have to do is just run `git push` from your project. Assuming that our AWS App Runner service are connected to `development` branch. 

```sh
$ git branch
* development
  master
```

```sh
$ git push origin development
```

## License

This project is open source licensed under MIT license.
