# Fixing Firebase Identity Toolkit API Error

## Error Message

If you're seeing this error in the console:

```
auth/requests-to-this-api-identitytoolkit-method-google.cloud.identitytoolkit.v1.projectconfigservice.getprojectconfig-are-blocked
```

This means that the Identity Toolkit API is either:
1. Not enabled in your Google Cloud project
2. Blocked by API key restrictions
3. Your domain is not authorized in Firebase Authentication settings

## Quick Fix Checklist

- [ ] Enable Identity Toolkit API in Google Cloud Console
- [ ] Check API key restrictions allow Identity Toolkit API
- [ ] Verify domain is authorized in Firebase Authentication
- [ ] Ensure Anonymous Authentication is enabled (if using it)
- [ ] Clear browser cache and restart the app

## Step-by-Step Solution

### Step 1: Enable Identity Toolkit API

1. **Open Google Cloud Console**
   - Go to: https://console.cloud.google.com/apis/library/identitytoolkit.googleapis.com
   - Make sure you're signed in with the account that has access to your Firebase project

2. **Select Your Project**
   - In the top bar, click the project dropdown
   - Select your Firebase project (e.g., `protocol-tx`)
   - If you don't see your project, make sure you have the correct permissions

3. **Enable the API**
   - On the Identity Toolkit API page, click the **"Enable"** button
   - Wait for the API to be enabled (usually takes a few seconds)
   - You should see a success message or the page will refresh showing the API as enabled

4. **Verify**
   - The page should now show "API enabled" or similar confirmation
   - You can also check at: https://console.cloud.google.com/apis/dashboard?project=YOUR_PROJECT_ID

### Step 2: Check API Key Restrictions

Your Firebase API key might have restrictions that block the Identity Toolkit API. Here's how to fix it:

1. **Open API Credentials**
   - Go to: https://console.cloud.google.com/apis/credentials
   - Make sure your project is selected in the top bar

2. **Find Your API Key**
   - Look for the API key that matches your `VITE_FIREBASE_API_KEY` environment variable
   - API keys typically start with `AIza...`
   - Click on the API key name to edit it

3. **Check API Restrictions**
   - Scroll down to the **"API restrictions"** section
   - You'll see one of two options:
     - **"Don't restrict key"** - This is fine, no restrictions
     - **"Restrict key"** - This needs to be checked

4. **If "Restrict key" is Selected**
   - Click on **"Restrict key"**
   - Select **"Restrict key to selected APIs"**
   - In the list, find and check **"Identity Toolkit API"**
   - If you see other Firebase APIs, make sure they're also checked:
     - Cloud Firestore API
     - Firebase Installations API
     - Firebase Remote Config API (if used)
   - Click **"Save"** at the bottom

5. **If "Don't restrict key" is Selected**
   - This should work, but if you're still getting errors, try:
     - Temporarily restrict the key to specific APIs (as above)
     - Then save and test
     - If it works, you can switch back to "Don't restrict key"

### Step 3: Verify Domain Authorization

Firebase Authentication requires that your domain is authorized. Here's how to check:

1. **Open Firebase Console**
   - Go to: https://console.firebase.google.com/
   - Select your project

2. **Navigate to Authentication Settings**
   - Click on **"Authentication"** in the left sidebar
   - Click on the **"Settings"** tab
   - Scroll down to **"Authorized domains"**

3. **Check Your Domain**
   - For local development: `localhost` should be in the list
   - For production: Your domain (e.g., `yourdomain.com`) should be in the list
   - The list should include:
     - `localhost` (for local dev)
     - `yourproject.firebaseapp.com` (default Firebase domain)
     - `yourproject.web.app` (default Firebase domain)
     - Your custom domain (if configured)

4. **Add Domain if Missing**
   - Click **"Add domain"**
   - Enter your domain (e.g., `localhost` for local dev, or your production domain)
   - Click **"Add"**
   - Note: For `localhost`, it's usually already there, but verify it exists

### Step 4: Enable Anonymous Authentication (If Using)

If your app uses anonymous authentication (which is common for initial setup), make sure it's enabled:

1. **Open Firebase Console**
   - Go to: https://console.firebase.google.com/
   - Select your project

2. **Navigate to Authentication Providers**
   - Click on **"Authentication"** in the left sidebar
   - Click on the **"Sign-in method"** tab

3. **Enable Anonymous**
   - Find **"Anonymous"** in the list of providers
   - Click on it
   - Toggle the **"Enable"** switch to ON
   - Click **"Save"**

### Step 5: Verify Configuration

After making all the changes, verify your configuration:

1. **Check Environment Variables**
   - Make sure your `.env` file has the correct values:
     ```env
     VITE_FIREBASE_API_KEY=your_api_key_here
     VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
     VITE_FIREBASE_PROJECT_ID=your-project-id
     ```

2. **Restart Your Development Server**
   - Stop your dev server (Ctrl+C)
   - Clear browser cache (Ctrl+Shift+Delete)
   - Restart dev server: `npm run dev`

3. **Test in Browser**
   - Open your app in the browser
   - Open Developer Console (F12)
   - Check for the error - it should be gone
   - Try to sign in or use Firebase features

## Troubleshooting

### Still Getting the Error?

1. **Wait a Few Minutes**
   - API changes can take a few minutes to propagate
   - Wait 2-5 minutes and try again

2. **Check Project Selection**
   - Make sure you're working with the correct Google Cloud project
   - Verify the Project ID matches your Firebase project

3. **Check API Key**
   - Verify the API key in your `.env` file matches the one in Google Cloud Console
   - Make sure there are no extra spaces or quotes

4. **Check Browser Console**
   - Look for the detailed error message
   - The error should now include helpful troubleshooting steps
   - Follow the steps shown in the console

5. **Verify API is Enabled**
   - Go to: https://console.cloud.google.com/apis/dashboard?project=YOUR_PROJECT_ID
   - Search for "Identity Toolkit API"
   - Make sure it shows as "Enabled"

### Common Issues

**Issue: "API key restrictions are too strict"**
- Solution: Either remove restrictions or ensure Identity Toolkit API is in the allowed list

**Issue: "Domain not authorized"**
- Solution: Add your domain to Firebase Authentication → Settings → Authorized domains

**Issue: "Anonymous auth not enabled"**
- Solution: Enable Anonymous authentication in Firebase Console

**Issue: "Still getting error after all steps"**
- Solution: 
  1. Wait 5-10 minutes for changes to propagate
  2. Clear browser cache completely
  3. Try in an incognito/private window
  4. Check if you're using the correct project ID

## Verification Links

Use these links to quickly verify your setup (replace `YOUR_PROJECT_ID` with your actual project ID):

- **Identity Toolkit API**: https://console.cloud.google.com/apis/library/identitytoolkit.googleapis.com?project=YOUR_PROJECT_ID
- **API Credentials**: https://console.cloud.google.com/apis/credentials?project=YOUR_PROJECT_ID
- **Firebase Auth Settings**: https://console.firebase.google.com/project/YOUR_PROJECT_ID/authentication/settings
- **Firebase Auth Providers**: https://console.firebase.google.com/project/YOUR_PROJECT_ID/authentication/providers
- **API Dashboard**: https://console.cloud.google.com/apis/dashboard?project=YOUR_PROJECT_ID

## Additional Resources

- [Firebase Authentication Documentation](https://firebase.google.com/docs/auth)
- [Google Cloud Identity Toolkit API Documentation](https://cloud.google.com/identity-platform/docs)
- [Firebase API Keys Explained](../docs/FIREBASE_KEYS_EXPLAINED.md)
- [Troubleshooting Guide](../docs/TROUBLESHOOTING.md)

## Need Help?

If you've followed all these steps and still have issues:

1. Check the browser console for detailed error messages
2. Verify all environment variables are set correctly
3. Make sure you have the correct permissions in Google Cloud Console
4. Check the [Troubleshooting Guide](../docs/TROUBLESHOOTING.md) for other common issues
5. Create an issue with:
   - The exact error message from the console
   - Your project ID (masked if sensitive)
   - Steps you've already taken
   - Browser and OS information



