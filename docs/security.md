# ShieldCV Security Principles

ShieldCV is built for students and early-career job seekers who need help organizing resume material without giving up control of private information. These seven principles explain the rules the app follows, in plain language, so you always know what the product is trying to protect.

## 1. Your data stays with you

ShieldCV is local-first. That means your resume drafts, notes, and scans are meant to stay on your own device instead of being copied to a company server. You should be able to open the app on a train, in a library, or anywhere else without needing to trust a hidden cloud service.

## 2. The app should work offline

The core experience is packaged as a Progressive Web App. After the first visit, the shell of the app can load again even when the network disappears. This matters because privacy is stronger when the product does not need to phone home just to open a screen.

## 3. Sensitive records should be encrypted at rest

When ShieldCV stores anything important on your device, it should be encrypted first. In simple terms, that means the app turns readable information into protected data so another person cannot casually inspect it if they gain access to your browser storage.

## 4. There should be no surprise server contact

A student should not need to wonder whether every tap is being sent to a remote analytics service. ShieldCV aims for zero server contact during normal use. If a feature ever needs outside communication, it should be obvious, limited, and optional.

## 5. Security should use layers, not one trick

Strong security comes from several defenses working together. ShieldCV uses browser protections such as Content Security Policy, Trusted Types, strict transport rules, and offline caching so that one mistake is less likely to expose private data.

## 6. You deserve an audit trail

If something security-related happens, the app should be able to record that event in a trustworthy way. An audit trail helps you understand what changed, when it changed, and whether the system behaved the way you expected.

## 7. Explanations should be understandable

Security features only help when people can see them and make informed choices. ShieldCV tries to explain its posture in clear language, show whether protections are active or still pending, and make the reasoning visible instead of hiding it behind jargon.
