# Email Notification Automation

## Setup Steps

### Gmail OAuth2 Setup
1. Go to Google Cloud Console - APIs & Services - Enable Gmail API
2. Create OAuth 2.0 credentials (Web application)
3. Add redirect URI (e.g., https://developers.google.com/oauthplayground)
4. Use OAuth Playground to get refresh token with scope https://mail.google.com/
5. Set env vars: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_USER

### Outlook/Microsoft 365 OAuth2 Setup
1. Register app in Azure AD (Microsoft Entra)
2. Add API permissions: Mail.Send (delegated)
3. Create client secret
4. Get refresh token via OAuth2 flow with tenant
5. Set env vars: OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, OUTLOOK_REFRESH_TOKEN, OUTLOOK_TENANT_ID, OUTLOOK_USER
