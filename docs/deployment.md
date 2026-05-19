# docs/deployment.md

# Fleet Management Platform - Deployment Guide

## Prerequisites

- Node.js 20+
- MongoDB 7+
- Redis 7+
- AWS Account (for S3 storage)
- Stripe Account (for billing)

## Environment Variables

```env
# Required
MONGODB_URI=mongodb://localhost:27017/vehicle-expense-tracker
NEXTAUTH_SECRET=your-secret-key
NEXTAUTH_URL=http://localhost:3000

# Optional but recommended
REDIS_URL=redis://localhost:6379
SENTRY_DSN=your-sentry-dsn
STRIPE_SECRET_KEY=sk_test_...

# AWS S3 (for file storage)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
S3_BUCKET=fleet-storage