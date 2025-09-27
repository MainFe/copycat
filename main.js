// main.js

const { app, BrowserWindow, globalShortcut, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');

let mainWindow;

const createWindows = () => {
  // 메인 창 (투명하고 캡처 기능 포함)
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  mainWindow.loadFile('capture.html');
  // mainWindow.webContents.openDevTools();

  // 창 크기 조절 이벤트
  mainWindow.on('will-resize', (event, newBounds) => {
    mainWindow.setBounds(newBounds, false); // 애니메이션 제거
    event.preventDefault();
  });
};

app.whenReady().then(async () => {
  createWindows();

  // Tesseract 설치 확인
  try {
    const { exec } = require("child_process");
    const util = require("util");
    const execPromise = util.promisify(exec);
    
    const { stdout } = await execPromise('tesseract --version');
    console.log('Tesseract 버전:', stdout.trim());
  } catch (err) {
    console.error('Tesseract가 설치되지 않았거나 PATH에 없습니다:', err.message);
    console.log('Tesseract 설치 방법: https://github.com/tesseract-ocr/tesseract');
  }



  globalShortcut.register('F1', async () => {
    try {
      if(mainWindow) {
        // textarea 내용 지우기
        mainWindow.webContents.send('clear-textarea');
        
        // 1️⃣ textarea 영역 정보 가져오기
        let textareaBounds = null;
        try {
          textareaBounds = await mainWindow.webContents.executeJavaScript(`
            (function() {
              const textarea = document.getElementById('text-display');
              if (textarea) {
                const rect = textarea.getBoundingClientRect();
                return {
                  x: rect.left,
                  y: rect.top,
                  width: rect.width,
                  height: rect.height
                };
              }
              return null;
            })();
          `);
        } catch (jsErr) {
          console.log('textarea 영역 정보 가져오기 중 오류:', jsErr.message);
        }

        if (!textareaBounds) {
          console.error('textarea 영역을 찾을 수 없습니다. 전체 창을 캡처합니다.');
          // 전체 창 캡처로 폴백
          const [width, height] = mainWindow.getSize();
          const [x, y] = mainWindow.getPosition();
          textareaBounds = {
            x: 0,
            y: 0,
            width: width,
            height: height
          };
        }

        // 2️⃣ mainWindow의 위치와 textarea의 상대 위치 계산
        const [windowX, windowY] = mainWindow.getPosition();
        const captureBounds = {
          x: windowX + textareaBounds.x,
          y: windowY + textareaBounds.y,
          width: textareaBounds.width,
          height: textareaBounds.height
        };

        console.log('캡처 영역:', captureBounds);

        // 3️⃣ 화면 캡처
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
        const fullScreenImage = await loadImage(sources[0].thumbnail.toPNG());
  
        const canvas = createCanvas(captureBounds.width, captureBounds.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(fullScreenImage, captureBounds.x, captureBounds.y, captureBounds.width, captureBounds.height, 0, 0, captureBounds.width, captureBounds.height);
  
        const buffer = canvas.toBuffer('image/png');
  
        // 4️⃣ 이미지 저장
        const savePath = path.join(__dirname, 'capture.png');
        fs.writeFileSync(savePath, buffer);
        console.log('캡처 이미지 저장 완료:', savePath);
  
        // 5️⃣ OCR 처리
        const text = await ocrFromBuffer(buffer);
        
        // 6️⃣ 추출된 텍스트 전송
        if (text && text.trim()) {
          console.log('추출된 텍스트:', text);
          
          const result = {
            originalText: text.trim()
          };
          mainWindow.webContents.send('ocr-result', result);
        } else {
          // OCR 결과가 없을 때
          mainWindow.webContents.send('ocr-result', {
            originalText: null
          });
        }
      }
    } catch (err) {
      console.error('OCR 오류:', err);
    }
  });

  ipcMain.handle('get-window-bounds', () => {
    return mainWindow.getBounds();
  });
  
  ipcMain.on('resize-window', (event, bounds) => {
    mainWindow.setBounds(bounds, false); // false → 애니메이션 제거
  });
  
  // 윈도우 드래그 시작
  ipcMain.on('start-drag', () => {
    if (mainWindow) {
      mainWindow.setIgnoreMouseEvents(false);
      // 드래그가 끝나면 다시 클릭 통과 설정을 복원
      setTimeout(() => {
        mainWindow.setIgnoreMouseEvents(true, { forward: true });
      }, 100);
    }
  });  

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindows();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

async function ocrFromBuffer(buffer) {
  try {
    const tempPath = "temp.png";
    fs.writeFileSync(tempPath, buffer);

    const { exec } = require("child_process");
    const util = require("util");
    const execPromise = util.promisify(exec);

    const { stdout } = await execPromise(`tesseract "${tempPath}" stdout -l kor+eng --oem 1 --psm 6`);
    fs.unlinkSync(tempPath);
    return stdout;
  } catch (err) {
    console.error("OCR 실패:", err);
    return null;
  }
}
