# LexiFlow Backend

A comprehensive legal contract management system with AI-powered contract generation and management features.

## Features

### AI-Powered Contract Generation
- **Google AI (Gemini)**: Primary AI provider for contract generation and analysis
- **Response Caching**: In-memory caching to reduce API calls and improve performance
- **Template Caching**: Common contract templates are cached for faster access

### Contract Management
- **Rich Text Editor**: TipTap-based editor with full formatting control
- **Favorites System**: Mark and prioritize important contracts
- **Shareable Links**: Generate secure, time-limited sharing links
- **Version Control**: Track contract changes and updates

### Security & Performance
- **Rate Limiting**: API rate limiting to prevent abuse
- **Authentication**: JWT-based authentication system with RS256 algorithm
- **Caching**: In-memory caching for improved performance
- **Error Handling**: Graceful fallbacks when AI services are unavailable

### Real-time Notifications
- **Server-Sent Events (SSE)**: Real-time notification delivery
- **Multiple Notification Types**: Contract updates, consultations, payments, etc.
- **Browser Notifications**: Native browser notification support
- **Unread Count Tracking**: Real-time unread count updates
- **Notification Preferences**: User-customizable notification settings

### Advanced Features
- **Pagination**: Comprehensive pagination across all list endpoints
- **Search & Filtering**: Advanced search capabilities with multiple filters
- **Dashboard Analytics**: Real-time dashboard with activity metrics
- **Client Portals**: Secure client collaboration portals
- **Consultation Management**: Video/audio consultation booking system
- **Payment Integration**: Razorpay payment processing
- **Subscription Management**: Flexible subscription plans
- **Role-based Access Control**: Granular permissions system

## Environment Variables

Add these to your `.env` file:

```env
# AI Provider (Google AI)
GOOGLE_AI_API_KEY=your_google_ai_api_key

# Note: Caching is now handled in-memory (no Redis required)

# Database
DATABASE_URI=your_mongodb_connection_string

# JWT
JWT_ACCESS_TOKEN_SECRET_PRIVATE=your_jwt_private_key
JWT_ACCESS_TOKEN_SECRET_PUBLIC=your_jwt_public_key

# Email
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_USERNAME=your_smtp_username
SMTP_PASSWORD=your_smtp_password
EMAIL_FROM=noreply@lexiflow.com

# Frontend
FRONTEND_URL=http://localhost:3000

# Razorpay (Payments)
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
```

## Installation

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start the Server**:
   ```bash
   npm run dev
   ```

## AI Provider Configuration

### Google AI (Gemini) - Primary Provider
- Get API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
- Supports multiple Gemini models: gemini-2.5-flash, gemini-1.5-flash, gemini-pro
- Used for both text generation and embeddings (embedding-001 model, 768 dimensions)

## Vector Embeddings & Semantic Search

The system uses **MongoDB Atlas Vector Search** for semantic context retrieval:

- **Automatic Embedding Generation**: Every AI conversation message gets a vector embedding
- **Semantic Search**: Finds relevant past conversations based on meaning, not just keywords
- **Better Context**: AI responses use semantically similar past messages for better understanding
- **MongoDB Atlas Vector Search**: Native database-level vector similarity search

### Setup Vector Search Index

**Required**: Create a vector search index in MongoDB Atlas. See `MONGODB_ATLAS_VECTOR_SEARCH_SETUP.md` for detailed instructions.

**Quick Setup**:
1. Go to MongoDB Atlas → Your Cluster → Atlas Search
2. Create Search Index named `vector_index`
3. Use the index definition from the setup guide
4. Wait for index to build (status: "Active")

**Note**: The system automatically falls back to JavaScript-based similarity if the vector index isn't available, so it works even before setup.

## Caching Features

**Note**: The application uses in-memory caching by default. This is perfect for single-instance deployments and development. For production scaling with multiple instances, consider implementing Redis.

### Contract Templates
- Common contract templates are cached for 24 hours
- Reduces API calls and improves response times
- Automatic cache invalidation on template updates

### AI Responses
- AI-generated content is cached for 1 hour
- Prevents duplicate API calls for similar requests
- Configurable TTL per request type

### Notifications
- Unread count cached for 5 minutes
- Notification lists cached for 5 minutes
- Real-time updates via Server-Sent Events

### In-Memory Cache Benefits
- **No external dependencies**: Works out of the box
- **Fast access**: Microsecond latency
- **Automatic cleanup**: Expired entries are removed automatically
- **Zero configuration**: No setup required

### When to Consider Redis
- Running multiple server instances (load balancing)
- Need cache persistence across server restarts
- Very high traffic requiring distributed caching
- Need pub/sub functionality for real-time features

## Notification System

### Real-time Notifications
The system provides real-time notifications using Server-Sent Events (SSE):

```javascript
// Connect to notifications
const eventSource = new EventSource('/api/v1/notifications/connect?token=YOUR_JWT_TOKEN');

// Listen for notifications
eventSource.addEventListener('notification', (event) => {
    const notification = JSON.parse(event.data);
    console.log('New notification:', notification);
});

// Listen for unread count updates
eventSource.addEventListener('unread_count', (event) => {
    const data = JSON.parse(event.data);
    console.log('Unread count:', data.count);
});
```

### Notification Types
- **Contract Updates**: Contract shared, accessed, updated, commented
- **Consultations**: Scheduled, started, ended, reminders
- **Payments**: Success, failure, refunds
- **Subscriptions**: Renewal, expiry, changes
- **Client Portals**: Invitations, uploads, comments
- **System**: Announcements, security alerts

### Browser Notifications
The system supports native browser notifications with permission handling:

```javascript
// Request notification permission
if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
}

// Show notification
if (Notification.permission === 'granted') {
    new Notification('New Contract', {
        body: 'You have a new contract to review',
        icon: '/favicon.ico'
    });
}
```

## API Endpoints

### 🔐 Authentication
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/logout` - User logout
- `POST /api/v1/auth/refresh-tokens` - Refresh access token
- `POST /api/v1/auth/forgot-password` - Request password reset
- `POST /api/v1/auth/reset-password` - Reset password with token
- `POST /api/v1/auth/verify-email` - Verify email address
- `POST /api/v1/auth/send-verification-email` - Resend verification email

### 👤 User Management
- `GET /api/v1/users/profile` - Get user profile
- `PATCH /api/v1/users/profile` - Update user profile
- `DELETE /api/v1/users/profile` - Delete user account
- `GET /api/v1/users` - Get all users (Admin)
- `GET /api/v1/users/:userId` - Get user by ID
- `PATCH /api/v1/users/:userId` - Update user (Admin)
- `DELETE /api/v1/users/:userId` - Delete user (Admin)

### 📄 Contract Management
- `POST /api/v1/contracts` - Create new contract
- `GET /api/v1/contracts` - Get user contracts (paginated)
- `GET /api/v1/contracts/:id` - Get contract by ID
- `PATCH /api/v1/contracts/:id` - Update contract
- `DELETE /api/v1/contracts/:id` - Delete contract
- `PATCH /api/v1/contracts/:id/favorite` - Mark as favorite
- `PATCH /api/v1/contracts/:id/unfavorite` - Remove from favorites
- `POST /api/v1/contracts/:id/share` - Share contract
- `GET /api/v1/contracts/:id/access` - Get contract access
- `POST /api/v1/contracts/:id/access` - Grant contract access
- `DELETE /api/v1/contracts/:id/access/:userId` - Revoke contract access
- `GET /api/v1/contracts/health/cache` - Check contract cache status

### 🤖 AI Features
- `POST /api/v1/contracts/generate` - Generate AI contract
- `POST /api/v1/contracts/generate-sections` - Generate contract sections
- `POST /api/v1/contracts/rewrite-section` - Rewrite section with AI
- `POST /api/v1/contracts/suggest-clause` - Suggest legal clauses
- `POST /api/v1/lexi/chat` - AI legal assistant chat (with semantic context)
- `POST /api/v1/lexi/analyze` - Analyze contract with AI
- `GET /api/v1/contracts/health/ai` - Check AI providers and cache status

**Note**: AI chat uses MongoDB Atlas Vector Search for semantic context retrieval across all conversations.

### 📋 Contract Types
- `POST /api/v1/contract-types` - Create contract type
- `GET /api/v1/contract-types` - Get all contract types (paginated)
- `GET /api/v1/contract-types/:id` - Get contract type by ID
- `PATCH /api/v1/contract-types/:id` - Update contract type
- `DELETE /api/v1/contract-types/:id` - Delete contract type
- `GET /api/v1/contract-types/search` - Search contract types
- `GET /api/v1/contract-types/stats` - Get contract type statistics
- `GET /api/v1/contract-types/similar/:id` - Get similar contract types

### 🏛️ Jurisdictions
- `POST /api/v1/jurisdictions` - Create jurisdiction
- `GET /api/v1/jurisdictions` - Get all jurisdictions (paginated)
- `GET /api/v1/jurisdictions/:id` - Get jurisdiction by ID
- `PATCH /api/v1/jurisdictions/:id` - Update jurisdiction
- `DELETE /api/v1/jurisdictions/:id` - Delete jurisdiction
- `GET /api/v1/jurisdictions/search` - Search jurisdictions by keyword
- `GET /api/v1/jurisdictions/stats` - Get jurisdiction statistics

### 📝 Templates
- `POST /api/v1/templates` - Create template
- `GET /api/v1/templates` - Get all templates (paginated)
- `GET /api/v1/templates/:id` - Get template by ID
- `PATCH /api/v1/templates/:id` - Update template
- `DELETE /api/v1/templates/:id` - Delete template
- `GET /api/v1/templates/search` - Search templates
- `GET /api/v1/templates/category/:category` - Get templates by category

### 📜 Clauses
- `POST /api/v1/clauses` - Create clause
- `GET /api/v1/clauses` - Get all clauses (paginated)
- `GET /api/v1/clauses/:id` - Get clause by ID
- `PATCH /api/v1/clauses/:id` - Update clause
- `DELETE /api/v1/clauses/:id` - Delete clause
- `GET /api/v1/clauses/search` - Search clauses
- `GET /api/v1/clauses/category/:category` - Get clauses by category

### 👨‍💼 Lawyers
- `POST /api/v1/lawyers` - Create lawyer profile
- `GET /api/v1/lawyers` - Get all lawyers (paginated)
- `GET /api/v1/lawyers/:id` - Get lawyer by ID
- `PATCH /api/v1/lawyers/:id` - Update lawyer profile
- `DELETE /api/v1/lawyers/:id` - Delete lawyer profile
- `GET /api/v1/lawyers/search` - Search lawyers
- `GET /api/v1/lawyers/specialization/:specialization` - Get lawyers by specialization
- `GET /api/v1/lawyers/rating/:id` - Get lawyer rating
- `POST /api/v1/lawyers/rating` - Rate lawyer

### 📅 Consultations
- `POST /api/v1/consultations` - Book consultation
- `GET /api/v1/consultations` - Get user consultations (paginated)
- `GET /api/v1/consultations/:id` - Get consultation by ID
- `PATCH /api/v1/consultations/:id` - Update consultation
- `DELETE /api/v1/consultations/:id` - Cancel consultation
- `POST /api/v1/consultations/:id/start` - Start consultation
- `POST /api/v1/consultations/:id/end` - End consultation
- `GET /api/v1/consultations/:id/remaining-time` - Get remaining time

### 🏢 Client Portals
- `POST /api/v1/client-portals` - Create client portal
- `GET /api/v1/client-portals` - Get user portals (paginated)
- `GET /api/v1/client-portals/:id` - Get portal by ID
- `PATCH /api/v1/client-portals/:id` - Update portal
- `DELETE /api/v1/client-portals/:id` - Delete portal
- `POST /api/v1/client-portals/:id/participants` - Add participants
- `DELETE /api/v1/client-portals/:id/participants/:participantId` - Remove participant
- `POST /api/v1/client-portals/:id/upload` - Upload document
- `GET /api/v1/client-portals/:id/documents` - Get portal documents
- `POST /api/v1/client-portals/:id/comments` - Add comment
- `GET /api/v1/client-portals/:id/comments` - Get portal comments

### 💳 Payments
- `POST /api/v1/payments/create-order` - Create Razorpay order
- `POST /api/v1/payments/verify` - Verify payment
- `GET /api/v1/payments/history` - Get payment history
- `POST /api/v1/payments/refund` - Process refund

### 📊 Subscriptions
- `GET /api/v1/subscriptions/plans` - Get available plans
- `POST /api/v1/subscriptions/subscribe` - Subscribe to plan
- `GET /api/v1/subscriptions/current` - Get current subscription
- `POST /api/v1/subscriptions/cancel` - Cancel subscription
- `POST /api/v1/subscriptions/renew` - Renew subscription

### 📊 Dashboard
- `GET /api/v1/dashboard/stats` - Get dashboard statistics
- `GET /api/v1/dashboard/trends` - Get trend data
- `GET /api/v1/dashboard/activity` - Get recent activity
- `GET /api/v1/dashboard/metrics` - Get specific metrics

### 🔔 Notifications
- `GET /api/v1/notifications/connect` - SSE connection for real-time notifications
- `GET /api/v1/notifications` - Get notifications (paginated)
- `GET /api/v1/notifications/unread-count` - Get unread count
- `PUT /api/v1/notifications/:id/read` - Mark notification as read
- `PUT /api/v1/notifications/read-all` - Mark all notifications as read
- `DELETE /api/v1/notifications/:id` - Delete notification
- `GET /api/v1/notifications/preferences` - Get notification preferences
- `PUT /api/v1/notifications/preferences` - Update notification preferences

### 🛠️ Roles & Permissions
- `POST /api/v1/roles` - Create role
- `GET /api/v1/roles` - Get all roles
- `GET /api/v1/roles/:id` - Get role by ID
- `PATCH /api/v1/roles/:id` - Update role
- `DELETE /api/v1/roles/:id` - Delete role
- `POST /api/v1/roles/:id/permissions` - Assign permissions
- `DELETE /api/v1/roles/:id/permissions/:permissionId` - Remove permission

### 🖼️ Images & Files
- `POST /api/v1/images/upload` - Upload image
- `GET /api/v1/images/:id` - Get image
- `DELETE /api/v1/images/:id` - Delete image
- `POST /api/v1/images/resize` - Resize image

### 🏥 Health Checks
- `GET /api/v1/contracts/health/ai` - Check AI providers and cache status
- `GET /api/v1/contracts/health/cache` - Check contract cache status
- `GET /api/v1/health` - General health check

## API Usage Examples

### Authentication
```bash
# Register new user
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "password": "password123",
    "userName": "johndoe"
  }'

# Login
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

### Contract Management
```bash
# Create contract
curl -X POST http://localhost:5000/api/v1/contracts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Service Agreement",
    "content": "This agreement...",
    "type": "service_agreement",
    "jurisdiction": "california"
  }'

# Get contracts with pagination
curl -X GET "http://localhost:5000/api/v1/contracts?page=1&limit=10&sortBy=createdAt&sortDirection=desc" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### AI Features
```bash
# Generate AI contract
curl -X POST http://localhost:5000/api/v1/contracts/generate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a software development agreement",
    "type": "service_agreement",
    "jurisdiction": "california"
  }'

# AI legal chat
curl -X POST http://localhost:5000/api/v1/lexi/chat \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What are the key clauses in a service agreement?",
    "context": "contract_analysis"
  }'
```

### Notifications (SSE)
```bash
# Connect to real-time notifications
curl -X GET "http://localhost:5000/api/v1/notifications/connect?token=YOUR_JWT_TOKEN" \
  -H "Accept: text/event-stream"

# Get notifications
curl -X GET http://localhost:5000/api/v1/notifications \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Mark as read
curl -X PUT http://localhost:5000/api/v1/notifications/NOTIFICATION_ID/read \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Client Portals
```bash
# Create portal
curl -X POST http://localhost:5000/api/v1/client-portals \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Project Alpha Portal",
    "description": "Client portal for Project Alpha",
    "participants": [
      {
        "email": "client@example.com",
        "clientName": "Client Name",
        "role": "viewer"
      }
    ]
  }'

# Add participants
curl -X POST http://localhost:5000/api/v1/client-portals/PORTAL_ID/participants \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "participants": [
      {
        "email": "newclient@example.com",
        "clientName": "New Client",
        "role": "editor"
      }
    ]
  }'
```

### Consultations
```bash
# Book consultation
curl -X POST http://localhost:5000/api/v1/consultations \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "lawyerId": "LAWYER_ID",
    "type": "video",
    "scheduledAt": "2024-01-15T14:00:00Z",
    "duration": 60,
    "notes": "Contract review consultation"
  }'
```

## Response Formats

### Success Response
```json
{
  "success": true,
  "data": {
    // Response data
  },
  "message": "Operation completed successfully"
}
```

### Paginated Response
```json
{
  "success": true,
  "data": {
    "results": [...],
    "pagination": {
      "page": 1,
      "limit": 10,
      "totalPages": 5,
      "totalDocs": 50,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message",
  "statusCode": 400,
  "errors": [
    {
      "field": "email",
      "message": "Email is required"
    }
  ]
}
```

## Authentication

All protected endpoints require a JWT token in the Authorization header:

```bash
Authorization: Bearer YOUR_JWT_TOKEN
```

For SSE connections, pass the token as a query parameter:
```bash
GET /api/v1/notifications/connect?token=YOUR_JWT_TOKEN
```

## Pagination

Most list endpoints support pagination with these query parameters:

- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10, max: 100)
- `sortBy` - Field to sort by (default: createdAt)
- `sortDirection` - Sort direction: asc/desc (default: desc)

## Search & Filtering

Many endpoints support search and filtering:

- `search` - General search term
- `keyword` - Specific keyword search
- `type` - Filter by type
- `status` - Filter by status
- `category` - Filter by category

## Rate Limiting

API requests are rate limited:
- **General**: 100 requests per 15 minutes
- **Auth**: 5 requests per 15 minutes
- **AI**: 10 requests per 15 minutes

## Error Handling

The system includes comprehensive error handling:

- **AI Provider Failures**: Automatic fallback to alternative providers
- **Cache Failures**: Graceful degradation without caching
- **Rate Limiting**: Proper error responses for quota exceeded
- **Network Issues**: Retry mechanisms and timeout handling

## Performance Optimization

1. **Caching Strategy**:
   - Contract templates: 24 hours
   - AI responses: 1 hour
   - User preferences: 1 hour

2. **AI Provider Load Balancing**:
   - Automatic provider switching on failures
   - Response time optimization
   - Cost-effective API usage

3. **Database Optimization**:
   - Indexed queries for favorites
   - Efficient pagination
   - Optimized aggregation pipelines

## Monitoring

Use the health check endpoint to monitor system status:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:666/api/v1/contracts/health/ai
```

Response:
```json
{
  "ai": {
    "google": true
  },
  "cache": true,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Troubleshooting

### AI Provider Issues
1. Check API keys in `.env`
2. Verify quota limits
3. Test with health check endpoint
4. Check network connectivity

### Cache Issues
1. In-memory cache is automatically managed
2. Cache is cleared on server restart
3. Monitor cache performance through health check endpoint
4. For production scaling, consider implementing Redis if needed

### Performance Issues
1. Monitor API response times
2. Check cache hit rates
3. Review AI provider quotas
4. Optimize database queries
