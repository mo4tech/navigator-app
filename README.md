<p align="center">
  <img src="https://flb-assets.s3.ap-southeast-1.amazonaws.com/static/fleetbase-logo-svg.svg" width="380" height="100" />
</p>

## Table of Contents

- [About](#about)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
    - [Configure Environment](#configure-environment)
- [Running in Simulator](#running-in-simulator)
    - [Run the app in iOS Simulator](#run-the-app-in-ios-simulator)
    - [Run the app in Android Simulator](#run-the-app-in-android-simulator)
- [Localization](#localization)
- [Navigation using Mapbox](#navigation-using-mapbox)
- [Documentation](#documentation)
- [Roadmap](#roadmap)

### About

Botit Fleet is a navigation and order management app for drivers and agents, built on Fleetbase. This app is fully customizable and supports QR code scanning, digital signatures, photos, and routing and navigation for agents. Drivers will be able to update activity to orders on the run as they complete their jobs. The app includes fuel report and issue management and creation. Enable seamless communication with built-in chat with operations personnel and customers.

**Key Features:**
- 🌍 **Multi-language support** - Full Arabic (العربية) and English localization with RTL support
- 📱 Real-time order tracking and management
- 📸 Photo capture and digital signatures
- 🗺️ GPS navigation and routing
- ⛽ Fuel reporting
- 💬 Built-in chat system
- 🔍 QR code scanning

### Prerequisites

- [Yarn](https://yarnpkg.com/) or [NPM](https://nodejs.org/en/)
- [React Native CLI](https://reactnative.dev/docs/environment-setup)
- Xcode 12+
- Android Studio

### Installation

Installation and setup is fairly quick, all you need is your Fleetbase API Key, and a few commands and your app will be up and running in minutes. Follow the directions below to get started.

Run the commands below; first clone the project, use npm or yarn to install the dependencies, then run `npx pod-install` to install the iOS dependencies. Lastly, create a `.env` file to configure the app.

```
git clone git@github.com:fleetbase/navigator-app.git
cd navigator-app
yarn
yarn pod:install
touch .env
```

### Configure Environment

Below is the steps needed to configure the environment. The first part covers collecting your required API keys.

1.  Get your API Keys;
2.  **If you don't have a Fleetbase account already** proceed to the [Fleetbase Console](https://console.fleetbase.io/) and click "Create an account", complete the registration form and you will be taken to the console.
3.  Once you're in the Fleetbase console select the "Developers" button in the top navigation. Next, select API Keys from the menu in the Developers section, and create a new API key. Copy your secret key generated, you'll need it later.
4.  Once you have both required API keys open your `.env` file.

In your `.env` file supply your Fleetbase API secret key, and additionally you will need a Google Maps API Key. Lastly, you'll also need to supply your app/bundle identifier, and an `APP_NAME` key.

Your `.env` file should look something like this once you're done.

```
# .env
APP_NAME=Botit Fleet
APP_IDENTIFIER=io.fleetbase.navigator
APP_LINK_PREFIX=navigator://
FLEETBASE_HOST=https://api.fleetbase.io
FLEETBASE_KEY=
BACKEND_URL=http://localhost:4000
```

### Running in Simulator

Once you have completed the installation and environment configuration, you're all set to give your app a test-drive in the simulator so you can play around.

#### Run the App in iOS Simulator

```
yarn ios
```

#### Run the App in Android Simulator

```
yarn android
```

### Localization

Botit Fleet supports multiple languages, including **Arabic (العربية)** and English. The app automatically detects the device's language settings and displays the appropriate translations.

#### Supported Languages

- **English** (en) - Default
- **Arabic** (ar) - Full RTL (Right-to-Left) support

#### Translation Files

Translation files are located in the `translations/` directory:
- `translations/en.json` - English translations
- `translations/ar.json` - Arabic translations

#### Adding a New Language

To add support for a new language:

1. Create a new JSON file in the `translations/` directory (e.g., `translations/fr.json` for French)
2. Copy the structure from `translations/en.json`
3. Translate all the text values while keeping the keys the same
4. The app will automatically detect and use the new language based on device settings

#### How It Works

The app uses `react-native-i18n` and `react-native-localize` to:
- Detect the device's preferred language
- Load the appropriate translation file
- Support RTL layouts for Arabic and other RTL languages
- Fallback to English if a translation is missing

### Navigation using Mapbox

### Documentation

For more information about Fleetbase, see the [documentation webpage](https://fleetbase.io/docs).

### About This App

Botit Fleet is a customized version of Fleetbase Navigator, tailored for specific fleet management needs with enhanced Arabic language support and localized features.
