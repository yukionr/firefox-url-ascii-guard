"""Verify URL bar behavior in an isolated headless Nightly profile via Marionette."""

import argparse
import json
import os
import socket
import subprocess
import tempfile
import time
from pathlib import Path

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'manifest.json').read_text())
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--firefox', default='firefox-nightly',
                    help='Firefox executable name on PATH or path to its binary')
args = parser.parse_args()
xpi = root / 'dist' / f"url-ascii-guard-{manifest['version']}.xpi"
addon_id = manifest['browser_specific_settings']['gecko']['id']

with tempfile.TemporaryDirectory(prefix='url-ascii-guard-profile-') as profile:
    port_socket = socket.socket()
    port_socket.bind(('127.0.0.1', 0))
    port = port_socket.getsockname()[1]
    port_socket.close()
    Path(profile, 'user.js').write_text(f'user_pref("marionette.port", {port});\nuser_pref("browser.shell.checkDefaultBrowser", false);\nuser_pref("browser.startup.homepage", "about:blank");\n')
    with Path(profile, 'firefox.log').open('w') as log:
        proc = subprocess.Popen([args.firefox, '--headless', '--no-remote', '--profile', profile, '--marionette', 'about:blank'], env={**os.environ, 'MOZ_REMOTE_ALLOW_SYSTEM_ACCESS': '1'}, stdout=log, stderr=log)
        try:
            for _ in range(100):
                try:
                    sock = socket.create_connection(('127.0.0.1', port), timeout=1)
                    break
                except OSError:
                    if proc.poll() is not None: raise RuntimeError('Firefox exited')
                    time.sleep(.1)
            else: raise RuntimeError('Marionette unavailable')
            sock.settimeout(20)
            def receive():
                size = b''
                while not size.endswith(b':'): size += sock.recv(1)
                data = b''
                while len(data) < int(size[:-1]): data += sock.recv(int(size[:-1]) - len(data))
                return json.loads(data)
            receive()
            seq = 0
            def command(name, params):
                global seq
                seq += 1
                body = json.dumps([0, seq, name, params]).encode()
                sock.sendall(str(len(body)).encode() + b':' + body)
                result = receive()
                if result[2]: raise RuntimeError(result[2])
                return result[3]
            command('WebDriver:NewSession', {})
            command('Marionette:SetContext', {'value': 'chrome'})
            def js(script):
                return command('WebDriver:ExecuteScript', {'script': 'const win = Services.wm.getMostRecentWindow("navigator:browser");' + script.replace('window.', 'win.'), 'args': [], 'newSandbox': True, 'sandbox': 'system'})
            ascii_file = Path(profile, 'ascii.html')
            unicode_file = Path(profile, '日本語.html')
            for f in [ascii_file, unicode_file]: f.write_text('<!doctype html><title>Test</title><p>local test</p>')
            def appearance():
                return js('return {color: window.getComputedStyle(window.document.querySelector(".urlbar-background")).backgroundColor, text: window.getComputedStyle(window.document.getElementById("urlbar-input")).color, nav: window.getComputedStyle(window.document.getElementById("nav-bar")).backgroundColor, tabs: window.getComputedStyle(window.document.getElementById("TabsToolbar")).backgroundColor, theme: window.document.documentElement.getAttribute("lwtheme"), marked: window.gURLBar.getAttribute("data-url-ascii-guard-warning"), uri:window.gBrowser.currentURI.spec, value:window.gURLBar.value, typed:window.gBrowser.selectedBrowser.userTypedValue};')['value']
            def wait_for(expected):
                for _ in range(80):
                    result = appearance()
                    if (result['color'] == 'rgb(179, 38, 30)') == expected: return result
                    time.sleep(.1)
                logs = js('return Services.console.getMessageArray().map(m=>m.message).filter(m=>/./.test(m)).slice(-12);')
                raise AssertionError({'appearance': result, 'logs':logs})
            def navigate(url):
                js('window.gBrowser.selectedBrowser.loadURI(Services.io.newURI(' + json.dumps(url) + '), {triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()});')
            def type_text(value):
                js('window.gURLBar.focus(); window.gURLBar.select();')
                keys = []
                for char in value:
                    keys += [{'type': 'keyDown', 'value': char}, {'type': 'keyUp', 'value': char}]
                command('WebDriver:PerformActions', {'actions': [{'type': 'key', 'id': 'keyboard', 'actions': keys}]})
            js('Services.prefs.setBoolPref("extensions.experiments.enabled", true);')
            print(command('Addon:Install', {'path': str(xpi), 'temporary': True}), flush=True)
            for dark in [0, 1]:
                js(f'Services.prefs.setIntPref("ui.systemUsesDarkTheme", {dark});')
                navigate(ascii_file.as_uri())
                time.sleep(.3)
                baseline = wait_for(False)
                navigate(unicode_file.as_uri())
                warning = wait_for(True)
                assert {k:warning[k] for k in ['nav','tabs','theme']} == {k:baseline[k] for k in ['nav','tabs','theme']}, (baseline,warning)
                print(f'PASS: dark={dark}, warning colors leave the toolbar and tabs unchanged', flush=True)
                for value, expected in [('日本語の検索',False), ('site:example.test 日本語',False), ('https://日本語.test/',True), ('ftp://例え.test/',True), ('https://example.test/',False), ('todo:買い物',False)]:
                    type_text(value)
                    result = wait_for(expected)
                    assert result['nav'] == baseline['nav'] and result['tabs'] == baseline['tabs'], result
                    print(f'PASS: input={value!r}, warning={expected}', flush=True)
                js('window.gURLBar.handleRevert(); window.gURLBar.inputField.dispatchEvent(new window.KeyboardEvent("keyup", {key:"Escape", bubbles:true}));')
                wait_for(True)
                navigate(ascii_file.as_uri())
                wait_for(False)
            navigate(unicode_file.as_uri())
            wait_for(True)
            print(command('Addon:Uninstall', {'id': addon_id}), flush=True)
            wait_for(False)
            print('PASS: URL-only color, search input, explicit protocol input, light/dark, uninstall cleanup', flush=True)
        finally:
            proc.terminate()
            try: proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
