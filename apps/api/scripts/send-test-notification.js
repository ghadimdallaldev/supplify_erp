import { query } from '../src/lib/db.js';
import { sendNotification } from '../src/services/notification.service.js';

async function sendTestNotification() {
  try {
    console.log('📧 Sending test notification...');

    // Get the first restaurant
    const { rows: restaurants } = await query('SELECT id, name FROM restaurant LIMIT 1');
    
    if (restaurants.length === 0) {
      console.log('⚠️  No restaurants found.');
      return;
    }

    const restaurantId = restaurants[0].id;
    console.log(`🎯 Sending to restaurant: ${restaurants[0].name}`);

    // Send test notification
    const notification = await sendNotification({
      userId: restaurantId,
      userType: 'RESTAURANT',
      notificationType: 'TEST',
      notificationCategory: 'test',
      title: 'Test Notification',
      message: 'This is a test notification from Supplify! If you receive this, the notification system is working correctly.',
      metadata: { test: true },
    });

    if (notification) {
      console.log('\n✅ Test notification sent successfully!');
      console.log(`📝 Notification ID: ${notification.id}`);
      console.log(`📧 Email sent: ${notification.email_sent}`);
      console.log(`📱 SMS sent: ${notification.sms_sent}`);
      console.log(`💬 In-app sent: ${notification.in_app_sent}`);
      console.log('\nCheck your console output above for email and SMS details.');
    } else {
      console.log('⚠️  Notification was not sent (user preferences may be disabled)');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

sendTestNotification()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });

