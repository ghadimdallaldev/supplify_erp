#!/bin/bash

echo "Initializing LocalStack resources..."

# Create S3 bucket
awslocal s3 mb s3://supplify-assets-dev
awslocal s3api put-bucket-cors --bucket supplify-assets-dev --cors-configuration '{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}'

echo "LocalStack initialization complete!"

