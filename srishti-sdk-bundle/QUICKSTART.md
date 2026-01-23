# Quick Start Guide

Get up and running with the Srishti SDK Bundle in 5 minutes!

## Step 1: Include the Loader

Add this to your HTML file:

```html
<script src="loader.js"></script>
```

## Step 2: Wait for SDK to Load

```javascript
window.addEventListener('srishti-sdk-ready', async () => {
    // SDK is ready!
});
```

## Step 3: Initialize SDK

```javascript
const sdk = await window.SrishtiSDKLoader.quickStart();
```

## Step 4: Build Your dApp!

```javascript
// Submit an event
await sdk.submitAppEvent('my-app.v1', 'ACTION', {
    ref: 'id_123',
    dataHash: await sdk.hashData({ data: 'value' }),
    metadata: { title: 'My Event' }
});

// Query events
const events = sdk.queryAppEvents('my-app.v1', 'ACTION');

// Get user info
console.log('Node ID:', sdk.nodeId);
console.log('Role:', sdk.getNodeRole());
console.log('Karma:', sdk.getKarmaBalance());
```

## Complete Example

```html
<!DOCTYPE html>
<html>
<head>
    <title>My dApp</title>
</head>
<body>
    <h1>My dApp</h1>
    <button onclick="submitEvent()">Submit Event</button>
    
    <script src="loader.js"></script>
    <script>
        let sdk = null;
        
        window.addEventListener('srishti-sdk-ready', async () => {
            sdk = await window.SrishtiSDKLoader.quickStart();
            console.log('Connected!', sdk.nodeId);
        });
        
        async function submitEvent() {
            if (!sdk) return;
            
            await sdk.submitAppEvent('my-app.v1', 'TEST', {
                ref: sdk.generateId('event'),
                dataHash: await sdk.hashData({ test: 'data' }),
                metadata: { message: 'Hello!' }
            });
            
            alert('Event submitted!');
        }
    </script>
</body>
</html>
```

## Next Steps

- Check out [examples/basic-example.html](examples/basic-example.html)
- Read the [full README](README.md)
- Explore the [SDK documentation](sdk/README.md)

## Troubleshooting

**SDK not loading?**
- Make sure all files are in the correct directory structure
- Check browser console for errors
- Ensure you're using HTTPS (required for Web Crypto API)

**Connection issues?**
- Make sure you have a node ID (user must be registered)
- Check network connectivity
- Verify signaling server is accessible

**Need help?**
- Check the [README](README.md) for detailed documentation
- Look at the [examples](examples/) folder
- Open an issue on GitHub
