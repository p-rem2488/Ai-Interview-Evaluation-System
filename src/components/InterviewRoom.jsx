// src/components/InterviewRoom.jsx
import React, { useEffect, useRef, useState } from 'react'
import VideoCard from './VideoCard'
import MonitoringPanel from './MonitoringPanel'
import * as tf from '@tensorflow/tfjs'
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection'
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import { sendSignal, onSignals, createRoom } from '../utils/signaling'
import { wordErrorRate } from '../utils/score'
import { firebaseConfig } from '../firebase'
import * as ort from 'onnxruntime-web'
window.ort = ort;
// ---------------------- NOTE ----------------------
// This file assumes you placed a small YOLO ONNX model at /models/yolov5s.onnx
// Install onnxruntime-web: npm install onnxruntime-web
// If model/class mapping differs, update PERSON_CLASS_ID and PHONE_CLASS_ID below.
// --------------------------------------------------

const YOLO_MODEL_URL = '/models/yolov5s.onnx'
const YOLO_INPUT_SIZE = 640 // recommended model size (320/640)
const YOLO_RUN_EVERY_N_FRAMES = 3 // run YOLO less frequently for perf
const PERSON_CLASS_ID = 0 // COCO: person = 0
const PHONE_CLASS_ID = 67 // COCO: cell phone = 67 (verify your model)

export default function InterviewRoom({ roomId = 'DEMO', role = 'candidate', onLeave }) {
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const pcRef = useRef(null)

  // YOLO session refs
  const yoloSessionRef = useRef(null)
  const yoloInputSizeRef = useRef(YOLO_INPUT_SIZE)
  const yoloFrameCounterRef = useRef(0)

  const localStreamRef = useRef(null)
  const [status, setStatus] = useState({
    facePresent: false,
    multipleFaces: false,
    eyesClosed: false,
    phoneDetected: false,
    transcript: '',
    score: 0
  })
  const [isConnected, setIsConnected] = useState(false)
  const [isMonitoring, setIsMonitoring] = useState(false)
  const faceModelRef = useRef(null)
  const objModelRef = useRef(null)
  const recogRef = useRef(null)
  const expectedText = useRef('')

  const TF = (typeof tf !== 'undefined' && Object.keys(tf).length > 0) ? tf : (window.tf || null)
  const FaceLib = (typeof faceLandmarksDetection !== 'undefined') ? faceLandmarksDetection : (window.faceLandmarksDetection || null)
  const CocoLib = (typeof cocoSsd !== 'undefined') ? cocoSsd : (window.cocoSsd || null)

  if (!TF) console.warn('Warning: tf (TensorFlow) not found as import or global.')
  if (!FaceLib) console.warn('Warning: faceLandmarksDetection not found as import or global.')
  if (!CocoLib) console.warn('Warning: cocoSsd not found as import or global.')

  const signalUnsubRef = useRef(null)
  const eyesClosedCounterRef = useRef(0)
  const monitorLoop = useRef(null)

  useEffect(() => {
    startLocalStream()
    return () => {
      stopAll()
      if (signalUnsubRef.current) {
        try { signalUnsubRef.current(); } catch (e) {}
        signalUnsubRef.current = null
      }
    }
    // eslint-disable-next-line
  }, [])

  useEffect(() => {
    const startMonitoringOnMount = async () => {
      try {
        console.log('Auto-start monitoring on mount...')
        try {
          if (firebaseConfig.apiKey && firebaseConfig.apiKey !== 'REPLACE_ME') {
            await startSignalListener()
          }
        } catch (e) {
          console.warn('startSignalListener warning', e)
        }
        await startMonitoring()
      } catch (err) {
        console.error('Auto-start monitoring error', err)
      }
    }
    startMonitoringOnMount()
    return () => {
      try { stopMonitoring() } catch (e) {}
    }
    // eslint-disable-next-line
  }, [])

  // ---------------- WebRTC / Streams ----------------
  async function startLocalStream() {
    try {
      console.log('Requesting camera & microphone...')
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: true
      })
      localStreamRef.current = s
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = s
        console.log('Local camera stream attached')
      } else {
        console.warn('localVideoRef.current is NULL — video element not ready yet')
      }
    } catch (e) {
      console.error('startLocalStream error:', e)
      alert('Camera / mic access is required for the demo. ' + (e && e.message ? e.message : ''))
    }
  }

  function stopAll() {
    try {
      localStreamRef.current?.getTracks().forEach(t => t.stop())
      pcRef.current?.close()
      stopMonitoring()
    } catch (e) {}
  }

  async function createOffer() {
    pcRef.current = new RTCPeerConnection()
    localStreamRef.current.getTracks().forEach(t => pcRef.current.addTrack(t, localStreamRef.current))
    const remoteStream = new MediaStream()
    pcRef.current.ontrack = e => {
      e.streams[0].getTracks().forEach(t => remoteStream.addTrack(t))
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream
    }
    pcRef.current.onconnectionstatechange = () => {
      setIsConnected(pcRef.current.connectionState === 'connected' || pcRef.current.connectionState === 'completed')
    }
    pcRef.current.onicecandidate = async e => {
      if (e.candidate && firebaseConfig.apiKey !== 'REPLACE_ME') {
        await sendSignal(roomId, { type: 'ice', candidate: e.candidate })
      }
    }
    const offer = await pcRef.current.createOffer()
    await pcRef.current.setLocalDescription(offer)

    if (firebaseConfig.apiKey === 'REPLACE_ME') {
      prompt('Share this offer with remote peer (copy entire JSON):', JSON.stringify(pcRef.current.localDescription))
    } else {
      await createRoom(roomId, { owner: role })
      await sendSignal(roomId, pcRef.current.localDescription)
    }
  }

  async function handleIncomingSignal(payload) {
    if (!pcRef.current) {
      pcRef.current = new RTCPeerConnection()
      localStreamRef.current.getTracks().forEach(t => pcRef.current.addTrack(t, localStreamRef.current))
      const remoteStream = new MediaStream()
      pcRef.current.ontrack = e => {
        e.streams[0].getTracks().forEach(t => remoteStream.addTrack(t))
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream
      }
      pcRef.current.onconnectionstatechange = () => {
        setIsConnected(pcRef.current.connectionState === 'connected' || pcRef.current.connectionState === 'completed')
      }
      pcRef.current.onicecandidate = async e => {
        if (e.candidate && firebaseConfig.apiKey !== 'REPLACE_ME') {
          await sendSignal(roomId, { type: 'ice', candidate: e.candidate })
        }
      }
    }

    if (payload.type === 'offer' || payload.type === 'answer') {
      const desc = payload
      await pcRef.current.setRemoteDescription(desc)
      if (desc.type === 'offer') {
        const answer = await pcRef.current.createAnswer()
        await pcRef.current.setLocalDescription(answer)
        if (firebaseConfig.apiKey === 'REPLACE_ME') {
          prompt('Send this answer back to remote peer (copy):', JSON.stringify(pcRef.current.localDescription))
        } else {
          await sendSignal(roomId, pcRef.current.localDescription)
        }
      }
    } else if (payload.type === 'ice' && payload.candidate) {
      try { await pcRef.current.addIceCandidate(payload.candidate) } catch (e) { console.warn(e) }
    }
  }

  async function startSignalListener() {
    if (firebaseConfig.apiKey === 'REPLACE_ME') return
    if (signalUnsubRef.current) return
    try {
      signalUnsubRef.current = onSignals(roomId, (payload) => {
        console.log('[signals] received', payload)
        if (!payload) return
        handleIncomingSignal(payload).catch(e => console.error('handleIncomingSignal error', e))
      })
      console.log('[signals] listening for room', roomId)
    } catch (e) {
      console.error('startSignalListener error', e)
    }
  }

  // ---------------- YOLO helpers (embedded) ----------------

  // prepare input tensor (CHW normalized) from video element to match model input size
  function prepareInputTensor(videoEl, inputSize = YOLO_INPUT_SIZE) {
    const canvas = document.createElement('canvas')
    canvas.width = inputSize
    canvas.height = inputSize
    const ctx = canvas.getContext('2d')
    const vw = videoEl.videoWidth || videoEl.width
    const vh = videoEl.videoHeight || videoEl.height
    // center-crop to square
    const minSide = Math.min(vw, vh)
    const sx = Math.max(0, (vw - minSide) / 2)
    const sy = Math.max(0, (vh - minSide) / 2)
    ctx.drawImage(videoEl, sx, sy, minSide, minSide, 0, 0, inputSize, inputSize)
    const imgData = ctx.getImageData(0, 0, inputSize, inputSize).data
    const data = new Float32Array(3 * inputSize * inputSize)
    for (let y = 0; y < inputSize; y++) {
      for (let x = 0; x < inputSize; x++) {
        const i = (y * inputSize + x) * 4
        const r = imgData[i] / 255
        const g = imgData[i + 1] / 255
        const b = imgData[i + 2] / 255
        const idx = y * inputSize + x
        data[idx] = r
        data[inputSize * inputSize + idx] = g
        data[2 * inputSize * inputSize + idx] = b
      }
    }
    return new ort.Tensor('float32', data, [1, 3, inputSize, inputSize])
  }

  // decode typical YOLO output tensor [1, N, D] where D = 5 + num_classes
  function decodeFromTensor(outputTensor, inputSize = YOLO_INPUT_SIZE, scoreThreshold = 0.25) {
    const data = outputTensor.data
    const dims = outputTensor.dims // [1, N, D]
    if (!dims || dims.length < 3) return []
    const N = dims[1]
    const D = dims[2]
    const numClasses = D - 5
    const results = []
    for (let i = 0; i < N; i++) {
      const base = i * D
      const cx = data[base]
      const cy = data[base + 1]
      const w = data[base + 2]
      const h = data[base + 3]
      const obj = data[base + 4]
      let bestClass = -1
      let bestConf = 0
      for (let c = 0; c < numClasses; c++) {
        const conf = data[base + 5 + c]
        if (conf > bestConf) { bestConf = conf; bestClass = c }
      }
      const conf = obj * bestConf
      if (conf < scoreThreshold) continue
      const x1 = cx - w / 2
      const y1 = cy - h / 2
      const x2 = cx + w / 2
      const y2 = cy + h / 2
      results.push({ x1, y1, x2, y2, score: conf, classId: bestClass })
    }
    return results
  }

  function nonMaxSuppression(boxes, iouThreshold = 0.45) {
    boxes.sort((a, b) => b.score - a.score)
    const keep = []
    const iou = (a, b) => {
      const x1 = Math.max(a.x1, b.x1)
      const y1 = Math.max(a.y1, b.y1)
      const x2 = Math.min(a.x2, b.x2)
      const y2 = Math.min(a.y2, b.y2)
      const w = Math.max(0, x2 - x1)
      const h = Math.max(0, y2 - y1)
      const inter = w * h
      const areaA = (a.x2 - a.x1) * (a.y2 - a.y1)
      const areaB = (b.x2 - b.x1) * (b.y2 - b.y1)
      const union = areaA + areaB - inter
      return union === 0 ? 0 : inter / union
    }
    for (let i = 0; i < boxes.length; i++) {
      let shouldKeep = true
      for (let j = 0; j < keep.length; j++) {
        if (iou(boxes[i], keep[j]) > iouThreshold) {
          shouldKeep = false; break
        }
      }
      if (shouldKeep) keep.push(boxes[i])
    }
    return keep
  }

  // load YOLO model using onnx runtime
  async function loadYoloModel(url = YOLO_MODEL_URL, inputSize = YOLO_INPUT_SIZE) {
    try {
      const session = await ort.InferenceSession.create(url, { executionProviders: ['wasm'] })
      return { session, inputSize }
    } catch (e) {
      console.error('loadYoloModel error', e)
      throw e
    }
  }

  // ---------------- Models: loadModels (face & coco & yolo) ----------------
  async function loadModels() {
    try {
      console.log('loadModels: using createDetector path (face-landmarks-detection)')
      const _face = FaceLib || (window.faceLandmarksDetection || null)
      const _cocoRaw = CocoLib || (window.cocoSsd || null)
      let _coco = _cocoRaw && _cocoRaw.default ? _cocoRaw.default : _cocoRaw

      if (!_face) {
        console.error('loadModels: face-landmarks lib not available.')
        throw new Error('face-landmarks missing')
      }

      const modelConst = _face.SupportedModels && (_face.SupportedModels.MediaPipeFaceMesh || _face.SupportedModels.mediapipeFacemesh)
      const chosenModel = modelConst || 'MediaPipeFaceMesh'
      console.log('loadModels: creating detector with model:', chosenModel)

      const detector = await _face.createDetector(chosenModel, {
        runtime: 'tfjs',
        maxFaces: 4,
        refineLandmarks: true
      })
      console.log('loadModels: detector created')

      faceModelRef.current = {
        estimateFaces: async (opts) => {
          const input = opts && opts.input ? opts.input : opts
          return await detector.estimateFaces(input, { flipHorizontal: false })
        }
      }

      if (!_coco) {
        console.error('loadModels: coco-ssd lib not available.')
        throw new Error('coco-ssd missing')
      }
      if (!objModelRef.current) {
        objModelRef.current = await _coco.load()
        console.log('loadModels: coco-ssd loaded')
      } else {
        console.log('loadModels: coco already loaded')
      }

      // load YOLO ONNX session (best-effort)
      try {
        if (!yoloSessionRef.current) {
          console.log('loadModels: loading YOLO ONNX from', YOLO_MODEL_URL)
          const { session, inputSize } = await loadYoloModel(YOLO_MODEL_URL, YOLO_INPUT_SIZE)
          yoloSessionRef.current = session
          yoloInputSizeRef.current = inputSize
          console.log('loadModels: YOLO loaded')
        }
      } catch (e) {
        console.warn('loadModels: YOLO load failed — continuing without YOLO', e)
      }

      console.log('loadModels: done — models ready')
    } catch (err) {
      console.error('loadModels error', err)
      throw err
    }
  }

  // ---------------- Frame analysis ----------------
  async function analyzeFrame() {
    const vid = localVideoRef.current
    if (!vid || vid.readyState < 2) return
    let newStatus = { ...status }

    // object detection (phone) using coco-ssd as backup
    try {
      if (objModelRef.current) {
        const objs = await objModelRef.current.detect(vid)
        newStatus.phoneDetected = objs.some(o => {
          const name = (o.class || '').toLowerCase()
          return (name.includes('phone') || name.includes('cell')) && (o.score || 0) > 0.45
        })
      }
    } catch (e) {
      console.warn('obj detect error', e)
    }

    // YOLO detection (run every N frames)
    let yoloBoxes = []
    try {
      if (yoloSessionRef.current) {
        yoloFrameCounterRef.current = (yoloFrameCounterRef.current + 1) % YOLO_RUN_EVERY_N_FRAMES
        if (yoloFrameCounterRef.current === 0) {
          const input = prepareInputTensor(vid, yoloInputSizeRef.current)
          const feedName = (yoloSessionRef.current.inputNames && yoloSessionRef.current.inputNames[0]) || (yoloSessionRef.current._inputNames && yoloSessionRef.current._inputNames[0]) || 'images'
          const feeds = {}
          feeds[feedName] = input
          const out = await yoloSessionRef.current.run(feeds)
          const outKey = Object.keys(out)[0]
          const raw = out[outKey] // ort.Tensor
          const detections = decodeFromTensor(raw, yoloInputSizeRef.current, 0.25)
          const nms = nonMaxSuppression(detections, 0.45)
          // map to video pixel coords (we center-cropped to square earlier)
          const vw = vid.videoWidth || vid.width
          const vh = vid.videoHeight || vid.height
          const minSide = Math.min(vw, vh)
          const sx = Math.max(0, (vw - minSide) / 2)
          const sy = Math.max(0, (vh - minSide) / 2)
          const scale = minSide / yoloInputSizeRef.current
          yoloBoxes = nms.map(d => {
            // d coords were in inputSize scale
            const xx1 = d.x1 * scale + sx
            const yy1 = d.y1 * scale + sy
            const xx2 = d.x2 * scale + sx
            const yy2 = d.y2 * scale + sy
            return { x1: xx1, y1: yy1, x2: xx2, y2: yy2, score: d.score, classId: d.classId }
          })
        }
      }
    } catch (e) {
      console.warn('yolo inference error', e)
      yoloBoxes = []
    }

    // Use YOLO boxes for face/person detection if available
    const faceBoxes = (yoloBoxes && yoloBoxes.length > 0)
      ? yoloBoxes.filter(b => b.classId === PERSON_CLASS_ID || b.classId === PHONE_CLASS_ID) // adapt if your model uses different face class
      : []

    // If YOLO boxes found -> set facePresent/multipleFaces/phoneDetected
    if (faceBoxes && faceBoxes.length > 0) {
      newStatus.facePresent = true
      newStatus.multipleFaces = faceBoxes.length > 1
      // detect phone by class or bounding box label
      newStatus.phoneDetected = newStatus.phoneDetected || faceBoxes.some(b => b.classId === PHONE_CLASS_ID)
    }

    // Now: run face-landmarks (higher quality) on the cropped face if possible (prefer YOLO crop),
    // else run on full frame
    try {
      if (faceModelRef.current) {
        let landmarksFaces = null
        if (faceBoxes && faceBoxes.length > 0) {
          // crop first face box to a small canvas and run landmarks on the crop for better results
          const face = faceBoxes[0]
          const cw = Math.max(96, Math.round(face.x2 - face.x1))
          const ch = Math.max(96, Math.round(face.y2 - face.y1))
          const c = document.createElement('canvas')
          c.width = cw
          c.height = ch
          const ctx = c.getContext('2d')
          ctx.drawImage(vid, face.x1, face.y1, face.x2 - face.x1, face.y2 - face.y1, 0, 0, cw, ch)
          landmarksFaces = await faceModelRef.current.estimateFaces({ input: c, returnTensors: false, flipHorizontal: false })
          // scale back: the detected keypoints will be in crop coordinates, but EAR uses relative distances so it's fine
        } else {
          // no YOLO faces -> run landmarks on the whole frame (previous behavior)
          landmarksFaces = await faceModelRef.current.estimateFaces({ input: vid, returnTensors: false, flipHorizontal: false })
        }

        const faces = landmarksFaces || []
        newStatus.facePresent = newStatus.facePresent || !!(faces && faces.length > 0)
        newStatus.multipleFaces = newStatus.multipleFaces || !!(faces && faces.length > 1)

        // debug
        console.log('faces (landmarks) count:', faces?.length)

        if (faces && faces.length > 0) {
          const f = faces[0]

          // ---- EAR (Eye Aspect Ratio) implementation ----
          // landmark indices for MediaPipe facemesh (scaledMesh) — works with detector output
          const LEFT = {
            outerCorner: 33, top1: 160, top2: 159, bottom1: 145, bottom2: 144, innerCorner: 133
          };
          const RIGHT = {
            outerCorner: 362, top1: 385, top2: 386, bottom1: 374, bottom2: 373, innerCorner: 263
          };

          const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

          const keypoints = f?.scaledMesh || (f?.keypoints && f.keypoints.map(k => [k.x, k.y, k.z])) || null
          let normEar = 0

          if (keypoints) {
            const l_p1 = keypoints[LEFT.outerCorner]
            const l_p4 = keypoints[LEFT.innerCorner]
            const l_p2 = keypoints[LEFT.top1]
            const l_p3 = keypoints[LEFT.top2]
            const l_p5 = keypoints[LEFT.bottom1]
            const l_p6 = keypoints[LEFT.bottom2]

            const r_p1 = keypoints[RIGHT.outerCorner]
            const r_p4 = keypoints[RIGHT.innerCorner]
            const r_p2 = keypoints[RIGHT.top1]
            const r_p3 = keypoints[RIGHT.top2]
            const r_p5 = keypoints[RIGHT.bottom1]
            const r_p6 = keypoints[RIGHT.bottom2]

            const safe = pts => pts && pts.every(Boolean)
            let leftEAR = 0, rightEAR = 0

            if (safe([l_p1, l_p2, l_p3, l_p4, l_p5, l_p6])) {
              leftEAR = (dist(l_p2, l_p6) + dist(l_p3, l_p5)) / (2 * dist(l_p1, l_p4))
            }
            if (safe([r_p1, r_p2, r_p3, r_p4, r_p5, r_p6])) {
              rightEAR = (dist(r_p2, r_p6) + dist(r_p3, r_p5)) / (2 * dist(r_p1, r_p4))
            }

            const ear = ((leftEAR > 0 ? leftEAR : 0) + (rightEAR > 0 ? rightEAR : 0)) /
                        ((leftEAR > 0 ? 1 : 0) + (rightEAR > 0 ? 1 : 0) || 1)

            normEar = isFinite(ear) ? ear : 0
            const EYE_CLOSED_THRESHOLD = 0.20
            const closed = normEar > 0 ? normEar < EYE_CLOSED_THRESHOLD : false

            if (closed) {
              eyesClosedCounterRef.current = Math.min(eyesClosedCounterRef.current + 1, 5)
            } else {
              eyesClosedCounterRef.current = Math.max(eyesClosedCounterRef.current - 1, 0)
            }
            newStatus.eyesClosed = eyesClosedCounterRef.current >= 3
          } else {
            // fallback to annotation-based method (older builds)
            const leftUpper = f?.annotations?.leftEyeUpper0
            const leftLower = f?.annotations?.leftEyeLower0
            if (leftUpper && leftLower && leftUpper[3] && leftLower[3]) {
              const top = leftUpper[3]
              const bottom = leftLower[3]
              const eyeDist = Math.hypot(top[0] - bottom[0], top[1] - bottom[1])
              const closed = eyeDist < 4.0
              if (closed) {
                eyesClosedCounterRef.current = Math.min(eyesClosedCounterRef.current + 1, 5)
              } else {
                eyesClosedCounterRef.current = Math.max(eyesClosedCounterRef.current - 1, 0)
              }
              newStatus.eyesClosed = eyesClosedCounterRef.current >= 3
            } else {
              newStatus.eyesClosed = false
            }
          }

          // debug logs to tune
          console.log('face landmarks sample:', f?.annotations || f?.scaledMesh || f?.keypoints)
          console.log('EAR avg:', normEar, 'eyesClosedCounter:', eyesClosedCounterRef.current)
        } else {
          eyesClosedCounterRef.current = 0
        }
      }
    } catch (e) {
      console.warn('face detect error', e)
    }

    // final safety: if YOLO indicated multiple faces earlier, ensure status
    if (!newStatus.multipleFaces && yoloBoxes && yoloBoxes.length > 1) {
      newStatus.multipleFaces = true
    }

    setStatus(s => ({ ...s, ...newStatus }))
  }

  // ---------------- Monitoring lifecycle ----------------
  async function startMonitoring() {
    if (isMonitoring) {
      console.log('startMonitoring: already running, skipping')
      return
    }
    setIsMonitoring(true)
    try {
      console.log('startMonitoring: loading models...')
      await loadModels()
      console.log('startMonitoring: models ready')

      try {
        if (!localStreamRef.current || !(localStreamRef.current.getTracks && localStreamRef.current.getTracks().length)) {
          console.log('startMonitoring: requesting local stream...')
          await startLocalStream()
        }
      } catch (e) { console.warn(e) }

      try { if (firebaseConfig.apiKey && firebaseConfig.apiKey !== 'REPLACE_ME') await startSignalListener() } catch(e){ console.warn(e) }

      try { startSpeechRecognition() } catch(e){ console.warn(e) }

      try { await analyzeFrame() } catch (e) { console.warn('initial analyzeFrame failed', e) }

      if (monitorLoop.current) clearInterval(monitorLoop.current)
      monitorLoop.current = setInterval(async () => {
        try {
          await analyzeFrame()
        } catch (err) { console.error('monitor loop error', err) }
      }, 700)

      console.log('startMonitoring: monitoring loop started')
    } catch (err) {
      console.error('startMonitoring error', err)
      try { stopMonitoring() } catch(e){}
      setIsMonitoring(false)
    }
  }

  function stopMonitoring() {
    setIsMonitoring(false)
    if (monitorLoop.current) clearInterval(monitorLoop.current)
    stopSpeechRecognition()
  }

  // ---------------- Speech recognition ----------------
  function startSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition not available')
      setStatus(s => ({ ...s, transcript: s.transcript || 'SpeechRecognition not supported' }))
      return
    }
    const recog = new SpeechRecognition()
    recog.continuous = true
    recog.interimResults = true
    recog.lang = 'en-US'
    recog.onresult = (e) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join(' ')
      let score = 0
      if (expectedText.current && expectedText.current.trim().length > 0) {
        const wer = wordErrorRate(expectedText.current, transcript)
        score = Math.max(0, 100 - Math.round(wer * 100))
      } else {
        const words = transcript.trim().split(/\s+/).filter(Boolean).length
        score = Math.min(100, words * 5)
      }
      setStatus(s => ({ ...s, transcript, score }))
    }
    recog.onerror = (e) => { console.error('recog error', e) }
    try {
      recog.start()
      recogRef.current = recog
      console.log('SpeechRecognition started')
    } catch (e) {
      console.warn('SpeechRecognition start error', e)
    }
  }

  function stopSpeechRecognition() {
    try {
      recogRef.current?.stop()
      recogRef.current = null
    } catch (e) {}
  }

  async function handleCreateOrJoin() {
    if (firebaseConfig.apiKey !== 'REPLACE_ME') {
      await startSignalListener()
    }
    if (role === 'interviewer') {
      await createOffer()
    } else {
      if (firebaseConfig.apiKey === 'REPLACE_ME') {
        const s = prompt('Paste remote offer JSON here:')
        if (!s) return
        const desc = JSON.parse(s)
        await handleIncomingSignal(desc)
      } else {
        await startSignalListener()
      }
    }
  }

  // ---------------- Render ----------------
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="md:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Room: {roomId || 'DEMO'}</div>
          <div className="space-x-2">
            <button onClick={() => { stopAll(); onLeave(); }} className="px-3 py-1 bg-red-600 text-white rounded-lg">End Meeting</button>
            <button onClick={() => { stopAll(); onLeave(); }} className="px-3 py-1 bg-slate-200 rounded-lg">Logout</button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <VideoCard title="You (Local)" streamRef={localVideoRef} muted={true} />
          <VideoCard title="Remote" streamRef={remoteVideoRef} muted={false} />
        </div>

        <div className="bg-white rounded-2xl p-4 shadow flex gap-2">
          <button onClick={handleCreateOrJoin} className="px-3 py-2 bg-indigo-600 text-white rounded-lg">Create/Join (Auto)</button>
          {firebaseConfig.apiKey === 'REPLACE_ME' && (
            <>
              <button onClick={() => { const s = prompt('Paste remote offer JSON here:'); if (s) handleIncomingSignal(JSON.parse(s)) }} className="px-3 py-2 bg-emerald-600 text-white rounded-lg">Paste Offer</button>
              <div className="text-sm text-slate-500 self-center">Manual copy/paste signaling if Firebase not configured.</div>
            </>
          )}
        </div>
      </div>

      <div>
        <MonitoringPanel status={status} />
        <div className="mt-4 bg-white p-4 rounded-2xl shadow space-y-2">
          <button onClick={startMonitoring} disabled={isMonitoring} className="w-full py-2 bg-emerald-600 text-white rounded-lg">Start Monitoring</button>
          <button onClick={stopMonitoring} disabled={!isMonitoring} className="w-full py-2 bg-slate-200 rounded-lg">Stop Monitoring</button>
          <div className="text-xs text-slate-500 mt-2">Note: Models are loaded in-browser. First load may take a few seconds.</div>
        </div>
      </div>
    </div>
  )
}
