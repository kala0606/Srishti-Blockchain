// Quick reset script - paste into browser console
(async function() {
    console.log('🔄 Resetting chain...');
    
    // Reset chain (will prompt for confirmation)
    await SrishtiApp.resetChain({ 
        message: 'Srishti timeline begins - Fresh start'
    });
    
    console.log('✅ Chain reset complete!');
    console.log('🔄 Refreshing page in 2 seconds...');
    
    setTimeout(() => {
        window.location.reload();
    }, 2000);
})();
