terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
      version = "4.9.0"
    }
  }
}

variable "app_name" {
  type = string
  default = "nodejs-api"
}

variable "app_env" {
  type = string
  default = "production"
}

variable "region" {
  type = string
  default = "us-east-1"
}

variable "app_git_url" {
  type = string
}

variable "app_token" {
  type = string
}

variable "app_branch" {
  type = string
  default = "master"
}

variable "app_port" {
  type = string
  default = "8080"
}

variable "tags" {
  type = map
  default = {
    env = "demo"
    app = "nodejs-app-runner-demo"
    fromTerraform = true
  }
}

provider "aws" {
  # Configuration options
  region = var.region
}

resource "random_string" "random" {
  length = 6
  special = false
  lower = true
  upper = false
}

locals {
    app_random = "${var.app_env}-${var.app_name}-${random_string.random.result}"
}

resource "aws_dynamodb_table" "demo" {
  name           = local.app_random
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "pk"
  range_key      = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }
  
  attribute {
    name = "data"
    type = "S"
  }

  global_secondary_index {
    name = "data-index"
    hash_key = "sk"
    range_key = "data"
    projection_type = "ALL"
  }
  
  tags = var.tags
}

data "aws_caller_identity" "current" {}

# Role for App Runner to access other AWS Services
resource "aws_iam_role" "demo_instance_role" {
  name = "NodeInstanceRole-${var.app_env}-${random_string.random.result}"
  tags = var.tags
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "tasks.apprunner.amazonaws.com"
        }
      }
    ]
  })

  inline_policy {
    name = "${local.app_random}-table-role"
    policy = jsonencode({
      Version = "2012-10-17"
      Statement = [
        {
          Effect = "Allow",
          Action = [
            "dynamodb:List*",
            "dynamodb:DescribeReservedCapacity*",
            "dynamodb:DescribeLimits",
            "dynamodb:DescribeTimeToLive"
          ]
          Resource = "*"
        },
        {
          Effect = "Allow",
          Action = [
            "dynamodb:GetItem",
            "dynamodb:Query",
            "dynamodb:PutItem",
            "dynamodb:DeleteItem"
          ]
          Resource = "arn:aws:dynamodb:*:*:table/${aws_dynamodb_table.demo.name}"
        },
        {
          Effect = "Allow",
          Action = [
            "dynamodb:GetItem",
            "dynamodb:Query",
            "dynamodb:PutItem",
            "dynamodb:DeleteItem"
          ]
          Resource = "arn:aws:dynamodb:*:*:table/${aws_dynamodb_table.demo.name}/*"
        }
      ]
    })
  }
  # ./demo_instance_role
}

resource "aws_apprunner_auto_scaling_configuration_version" "demo" {
  auto_scaling_configuration_name = "${var.app_env}_${var.app_name}"

  max_concurrency = 100
  max_size = 5
  min_size = 1
  
  tags = var.tags
}

resource "aws_apprunner_service" "demo" {
  depends_on = [
    aws_apprunner_connection.demo,
    aws_apprunner_auto_scaling_configuration_version.demo
  ]
  
  service_name = local.app_random
  tags = var.tags

  source_configuration {
    auto_deployments_enabled = true
    
    authentication_configuration {
      connection_arn = aws_apprunner_connection.demo.arn
    }
  
    code_repository {
      source_code_version {
        type = "BRANCH"
        value = var.app_branch
      }
      
      repository_url = var.app_git_url
      
      code_configuration {
        configuration_source = "API"
        
        code_configuration_values {
          port = var.app_port
          build_command = "npm install --production"
          start_command = "node src/index.js"
          runtime = "NODEJS_14"
          
          runtime_environment_variables = {
            APP_TABLE_NAME = aws_dynamodb_table.demo.name
            APP_TOKEN = var.app_token
            NODE_PORT = var.app_port
            NODE_ENV = var.app_env
          } # ./env
        } # ./conf values
        
      } # ./configuration
    } # ./repository
  } # ./source_configuration
  
  instance_configuration {
    cpu = "1024"
    memory = "2048"
    instance_role_arn = aws_iam_role.demo_instance_role.arn
  }
  
  health_check_configuration {
    healthy_threshold = 1
    timeout = 5
    interval = 1
    unhealthy_threshold = 3
  }
  
  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.demo.arn
}

resource "aws_apprunner_connection" "demo" {
  connection_name = local.app_random
  provider_type   = "GITHUB"
  tags = var.tags
}

output "app_runner" {
  value = {
    arn = aws_apprunner_service.demo.arn
    endpoint = "https://${aws_apprunner_service.demo.service_url}"
  }
}