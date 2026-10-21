CC AI SOLUTIONS WEBSITE - VOICE DEMO (WINDOWS)
==============================================

Files in this folder
--------------------
start-website.bat  Double-click this to run the site at http://localhost:8080
serve.ps1          The tiny local web server used by start-website.bat
index.html         The approved landing page.
site.js            Page behaviour: scroll colours, mobile menu, FAQ.
vapi-demo.js       Connects the Interactive Demo mic button to your Vapi assistant.
config.js          Your Vapi PUBLIC key and assistant ID (already filled in).

NEVER put your Vapi PRIVATE key in any of these files.


HOW TO TEST
-----------
1. Right-click the downloaded ZIP > Extract All > Extract.
2. Open the extracted "cc-ai-website" folder.
3. Double-click  start-website.bat
   - If Windows shows "Windows protected your PC", click "More info" > "Run anyway".
   - A black window opens and Chrome/Edge opens http://localhost:8080
   - Keep the black window open while testing. Close it to stop the site.
4. In the browser tab, click the yellow mic button and choose "Allow".
5. Wait for "Connected. Start talking", then speak. Your words and the
   assistant's replies appear in the demo card.
6. Click the mic again (it shows a square) to end the call.

Always test in a normal Chrome or Edge tab at http://localhost:8080 -
not by double-clicking index.html and not inside a preview window.


IF THE MICROPHONE IS BLOCKED
----------------------------
The message under the button tells you which case it is. Press F12 > Console
to see the exact error name and cause.

(a) Opened as a file (address starts with file:///)
    -> Close it and use start-website.bat instead.

(b) Blocked in the browser
    -> Click the icon left of the address bar (http://localhost:8080),
       set Microphone to "Allow", reload the page (F5), click the mic again.

(c) Blocked by Windows or no microphone
    -> Windows Settings > Privacy & security > Microphone:
       turn ON "Microphone access", "Let apps access your microphone" and
       "Let desktop apps access your microphone".
    -> Windows Settings > System > Sound > Input: make sure a microphone
       is selected and the level bar moves when you speak.


AFTER IT WORKS - LOCK DOWN THE PUBLIC KEY
-----------------------------------------
Vapi dashboard > API Keys > Public API Keys > edit your key:
- Allowed Origins:  http://localhost:8080   (later add your real https domain)
- Allowed Assistants: only "CC AI SOLUTIONS Demo Receptionist"
- Transient Assistant: OFF
