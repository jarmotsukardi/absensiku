#!/bin/bash

# Quick Test Script untuk APK AbsensiKu
# Usage: ./test-apk.sh

APK_PATH="app/build/outputs/apk/release/app-release-signed.apk"
PACKAGE_NAME="com.absensiku.webview"

echo "🔍 Checking for connected devices..."
DEVICES=$(adb devices | grep -v "List of devices" | grep "device$" | wc -l | tr -d ' ')

if [ "$DEVICES" -eq 0 ]; then
    echo "❌ No devices found!"
    echo ""
    echo "Please:"
    echo "  1. Connect Android device via USB, OR"
    echo "  2. Start Genymotion/Android Emulator"
    echo ""
    echo "Then run: adb devices"
    exit 1
fi

echo "✅ Device found!"
adb devices

echo ""
echo "📦 Installing APK..."
adb install -r "$APK_PATH"

if [ $? -eq 0 ]; then
    echo "✅ Installation successful!"
else
    echo "❌ Installation failed!"
    exit 1
fi

echo ""
echo "🚀 Launching app..."
adb shell am start -n "$PACKAGE_NAME/.MainActivity"

sleep 3

echo ""
echo "📸 Taking screenshot..."
adb shell screencap -p /data/local/tmp/screenshot.png
adb pull /data/local/tmp/screenshot.png ./screenshot_login.png

echo ""
echo "✅ Test setup complete!"
echo ""
echo "📋 Next steps:"
echo "  1. Check the app on device/emulator"
echo "  2. Test login flow"
echo "  3. See screenshot: screenshot_login.png"
echo ""
echo "🔍 To view logs:"
echo "  adb logcat | grep -i absensiku"
