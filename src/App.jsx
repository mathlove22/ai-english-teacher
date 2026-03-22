import React, { useState, useEffect, useRef } from 'react';
import { PenTool, Star, Volume2, Loader2, ArrowRight, Check, X, ChevronRight, Monitor, Cloud, Image as ImageIcon, Printer } from 'lucide-react';

// API Key setup (사용자 지정 하드코딩 키)
const activeApiKey = import.meta.env.VITE_GEMINI_API_KEY || "AIzaSyCBcvB0Ka5sBW26jcykaWF9x-xeyIxQ7LU";

export default function App() {
  const [step, setStep] = useState('input');
  const [inputText, setInputText] = useState('');
  
  // 수준 및 강도 상태
  const [targetLevel, setTargetLevel] = useState('일반(성인)');
  const [detailLevel, setDetailLevel] = useState('일반');
  
  const [containerWidth, setContainerWidth] = useState('max-w-[1000px]');
  const [imageFile, setImageFile] = useState(null);
  const [isExtractingText, setIsExtractingText] = useState(false);

  const [analysisResult, setAnalysisResult] = useState([]);
  const [sentences, setSentences] = useState([]);
  const [showTranslation, setShowTranslation] = useState(false);
  const [activeItem, setActiveItem] = useState(null);
  const [error, setError] = useState('');

  // 퀴즈 관련 상태
  const [quizData, setQuizData] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [isQuizLoading, setIsQuizLoading] = useState(false);

  // 오디오 재생 및 캐싱 상태
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [ttsMode, setTtsMode] = useState('native');
  const activeAudioRef = useRef(null); 
  const audioCacheRef = useRef(new Map());

  const fileInputRef = useRef(null);

  const levelOptions = ['초등학생', '중학생', '고등학생', '일반(성인)'];
  const detailOptions = ['일반', '자세히', '아주 자세히'];

  // 컴포넌트 마운트/언마운트 시 메모리 관리
  useEffect(() => {
    return () => {
      audioCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
      window.speechSynthesis.cancel();
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
      }
    };
  }, []);

  const fetchWithRetry = async (url, options, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response;
      } catch (e) {
        if (i === retries - 1) throw e;
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
      }
    }
  };

  // --- 텍스트 분석 (강도별 로직 적용) ---
  const analyzeText = async () => {
    if (!inputText.trim()) {
      setError('분석할 영어 지문을 적어주세요!');
      return;
    }
    if (!activeApiKey) {
      setError('앗! 구글 Gemini API 키가 설정되지 않았습니다.');
      return;
    }
    setError('');
    setStep('loading');

    let detailPrompt = "";
    if (detailLevel === '일반') {
      detailPrompt = "[일반 모드]: 일반적인 수준의 꼼꼼한 수업입니다. 지문의 핵심이 되는 단어 및 숙어(idiom) 표현들을 10~15개 이상 넉넉하게 추출하여 설명하세요.";
    } else if (detailLevel === '자세히') {
      detailPrompt = "[자세히 모드]: 일반 모드의 **2배 분량(20~30개 이상)**으로 훨씬 더 많은 영단어와 숙어를 추출하세요! 학생이 놓치기 쉬운 세세한 뉘앙스와 작은 표현들까지 무조건 전부 포함해서 샅샅이 파헤쳐주세요.";
    } else {
      detailPrompt = "[아주 자세히 모드]: 일반 모드의 **4배 분량(40~50개 이상)**으로 단어를 폭발적으로 많이 엄청나게 쏟아내듯 역대급으로 대량 추출하세요! 지문에 쓰인 모든 핵심 단어뿐만 아니라, **숙어(idioms), 구동사(phrasal verbs), 자주 쓰이는 전치사구, 핵심 문장 구조까지** 하나도 빠짐없이 낱낱이 분해해서 극도로 방대하고 치밀하게 모두 설명하세요. 길이 제한이나 토큰 걱정은 절대 하지 마시고, 양이 넘치고 어마어마하게 많아야 학생이 만족합니다!!! 생략은 절대 금지합니다.";
    }

    const systemPrompt = `
      당신은 학생들을 진심으로 아끼고 열정적인 영어 선생님입니다. 
      대상 학생의 수준은 [${targetLevel}]입니다. 이 수준의 학생이 모를 만한 단어나 숙어, 구문들을 끈질기고 집요하게 전부 타겟팅하세요. 단어(Vocabulary) 분만 아니라 두 단어 이상의 숙어(Idiom)도 반드시 대량으로 포함하세요!
      말투는 아주 친절하고 다정하게, 공책에 펜으로 꼼꼼히 적어주는 듯한 과외 선생님 체("~해요", "~란다")를 사용하세요.
      
      주어진 영어 지문을 분석하세요.
      [추출 분량 및 강도 규칙]
      ${detailPrompt}
      
      전체 지문을 문장 단위로 나누어 자연스럽고 친절한 한국어 해석을 함께 제공하세요.

      결과는 반드시 아래 JSON 형식으로만 완벽하게 출력해야 합니다.
      {
        "items": [
          {
            "phrase": "지문에서 추출한 정확한 영어 단어 또는 숙어/구조 (대소문자 본문 일치 필수)",
            "type": "vocabulary 혹은 idiom 혹은 grammar",
            "title": "설명 창 제목 (예: 'take for granted (숙어: 당연히 여기다)')",
            "explanation": "선생님의 아주 다정한 설명 (뉘앙스나 중요도 위주)",
            "etymology": "어원 분석이나 학생이 쉽게 외울 수 있는 직관적인 암기 팁 (※ 필수 작성란입니다! 어원이 없다면 연상 암기법이나 유래라도 무조건 1줄 이상 지어내서라도 작성하세요. 절대 비워두지 마세요.)",
            "synonyms": "비슷한 말이나 반대말 (예: assume, presume)",
            "realWorld": "실제 원어민 활용 팁",
            "exampleEn": "이해를 돕는 예문",
            "exampleKo": "예문 한국어 뜻"
          }
        ],
        "sentences": [
          {
            "en": "본문 영어 문장",
            "ko": "문장 해석"
          }
        ]
      }
    `;

    try {
      const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${activeApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `지문:\n${inputText}` }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const data = await response.json();
      const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (resultText) {
        const parsed = JSON.parse(resultText);
        setAnalysisResult(parsed.items || []);
        setSentences(parsed.sentences || []);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setStep('study');
      } else {
        throw new Error('결과를 받아오지 못했습니다.');
      }
    } catch (err) {
      console.error(err);
      setError('분석 중에 펜이 멈췄어요. API 키 할당량을 초과했거나 응답이 너무 길어졌을 수 있어요!');
      setStep('input');
    }
  };

  const generateQuiz = async () => {
    if (!activeApiKey) return;
    setIsQuizLoading(true);

    const learnedPhrases = analysisResult.map(i => i.phrase).join(', ');
    const systemPrompt = `
      당신은 다정한 영어 선생님입니다.
      학생의 수준은 [${targetLevel}]입니다.
      학생이 방금 복습한 지문과 핵심 표현을 바탕으로 쪽지 시험(객관식 5문제)을 만들어주세요.
      문제(question)는 쉬운 한국어로, 보기(options)는 영어로 내도 좋습니다.
      빈칸 채우기, 의미 찾기, 문법 등 다양하게 섞어주세요.
      
      반드시 아래 JSON 형식으로만 출력하세요.
      {
        "questions": [
          {
            "question": "문제 내용",
            "options": ["보기1", "보기2", "보기3", "보기4"],
            "answerIndex": 0, 
            "explanation": "해설 (정답인 이유와 격려의 메세지)"
          }
        ]
      }
    `;

    try {
      const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${activeApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `[지문]\n${inputText}\n\n[핵심 표현]\n${learnedPhrases}` }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const data = await response.json();
      const parsed = JSON.parse(data.candidates[0].content.parts[0].text);

      setQuizData(parsed.questions);
      setCurrentQ(0);
      setScore(0);
      setSelectedAnswer(null);
      setShowExplanation(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setStep('quiz');
    } catch (err) {
      console.error(err);
      alert('퀴즈를 만드는 도중 종이가 찢어졌어요! 다시 시도해주세요.');
    } finally {
      setIsQuizLoading(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!activeApiKey) {
      setError("사진을 분석하려면 API 키가 필요합니다.");
      return;
    }

    setImageFile(file);
    setIsExtractingText(true);
    setError('');

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = reader.result.split(',')[1];
        const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${activeApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "이미지 속의 영어를 그대로 베껴 써줘. 다른 말은 붙이지 말고 딱 본문만." },
                { inlineData: { mimeType: file.type, data: base64Data } }
              ]
            }]
          })
        });

        const data = await response.json();
        const extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (extractedText) {
          setInputText(extractedText);
        } else {
          throw new Error('텍스트를 찾지 못했습니다.');
        }
        setIsExtractingText(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setError('사진에서 글씨를 잘 못 읽겠어요. 선명한 지문 사진으로 다시 올려줄래요?');
      setIsExtractingText(false);
    }
  };

  const pcmToWavUrl = (base64, sampleRate) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const buffer = new ArrayBuffer(44 + bytes.length);
    const view = new DataView(buffer);
    const writeString = (view, offset, string) => {
      for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + bytes.length, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, bytes.length, true);

    const pcmData = new Uint8Array(buffer, 44);
    pcmData.set(bytes);
    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  };

  const speak = async (text, e) => {
    if (e) e.stopPropagation();
    if (!text) return;

    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.currentTime = 0;
    }
    window.speechSynthesis.cancel();
    setIsPlayingAudio(true);

    if (ttsMode === 'native' || !activeApiKey) {
      if (ttsMode === 'api' && !activeApiKey) {
        console.warn("API 키가 없어 PC 기본 TTS로 전환합니다.");
        setTtsMode('native');
      }
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 0.9;
        
        const voices = window.speechSynthesis.getVoices();
        const englishVoice = voices.find(voice => voice.lang.includes('en-US') || voice.lang.includes('en_US') || voice.lang.includes('en-GB'));
        if (englishVoice) utterance.voice = englishVoice;

        utterance.onend = () => setIsPlayingAudio(false);
        utterance.onerror = () => setIsPlayingAudio(false);
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        setIsPlayingAudio(false);
      }
      return;
    }

    try {
      let audioUrl = audioCacheRef.current.get(text);
      if (!audioUrl) {
        const payload = {
          contents: [{ parts: [{ text: text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } }
          },
          model: "gemini-2.5-flash-preview-tts"
        };
        const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${activeApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        const inlineData = data.candidates[0].content.parts[0].inlineData;
        const base64Audio = inlineData.data;
        let sampleRate = 24000;
        const rateMatch = inlineData.mimeType.match(/rate=(\d+)/);
        if (rateMatch && rateMatch[1]) sampleRate = parseInt(rateMatch[1], 10);
        
        audioUrl = pcmToWavUrl(base64Audio, sampleRate);
        audioCacheRef.current.set(text, audioUrl);
      }
      const audio = new Audio(audioUrl);
      activeAudioRef.current = audio;
      audio.onended = () => setIsPlayingAudio(false);
      audio.onerror = () => setIsPlayingAudio(false);
      await audio.play();
    } catch (err) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.onend = () => setIsPlayingAudio(false);
      utterance.onerror = () => setIsPlayingAudio(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  const renderHighlightedSentence = (text) => {
    if (!text || analysisResult.length === 0) return <span>{text}</span>;

    let processedText = text;
    const sortedItems = [...analysisResult].sort((a, b) => b.phrase.length - a.phrase.length);
    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    sortedItems.forEach((item, index) => {
      const regex = new RegExp(`(${escapeRegExp(item.phrase)})`, 'gi');
      processedText = processedText.replace(regex, `|||${index}|||$1|||END|||`);
    });

    const parts = processedText.split(/\|\|\|/);

    return (
      <>
        {parts.map((part, i) => {
          const itemIndex = parseInt(part);
          if (!isNaN(itemIndex) && sortedItems[itemIndex]) {
            const item = sortedItems[itemIndex];
            const textToShow = parts[i + 1];
            parts[i + 1] = '';
            parts[i + 2] = '';

            if (textToShow) {
              return (
                <span
                  key={i}
                  className={`relative cursor-pointer transition-all duration-200 px-1 rounded-sm mx-px
                    ${activeItem === item 
                      ? 'bg-yellow-400 font-bold text-ink-blue scale-105 inline-block shadow-sm z-10' 
                      : 'bg-yellow-200/70 hover:bg-yellow-300 text-ink-blue border-b-2 border-red-400 border-dashed'}
                  `}
                  onMouseEnter={() => setActiveItem(item)}
                  onClick={(e) => speak(textToShow, e)}
                  title="클릭해서 단어 발음 듣기"
                >
                  {textToShow}
                </span>
              );
            }
          }
          if (part !== 'END' && part !== '') {
            return <span key={i}>{part}</span>;
          }
          return null;
        })}
      </>
    );
  };

  const handleAnswerClick = (index) => {
    if (showExplanation) return;
    setSelectedAnswer(index);
    setShowExplanation(true);
    if (index === quizData[currentQ].answerIndex) {
      setScore(s => s + 1);
    }
  };

  const handleNextQ = () => {
    if (currentQ < quizData.length - 1) {
      setCurrentQ(c => c + 1);
      setSelectedAnswer(null);
      setShowExplanation(false);
    } else {
      setStep('quiz_result');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const resetToStart = () => {
    setStep('input');
    setAnalysisResult([]);
    setSentences([]);
    setActiveItem(null);
    setShowTranslation(false);
    setQuizData([]);
    
    audioCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
    audioCacheRef.current.clear();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className={`min-h-screen py-8 px-4 sm:px-8 ${containerWidth} mx-auto relative font-sans text-ink-blue transition-all duration-300 print:bg-white print:w-full print:max-w-none print:p-0 print:m-0`}>
      {/* 아날로그 공책 왼쪽 붉은색 여백 선장식 (출력시 숨김) */}
      <div className="fixed left-8 sm:left-14 top-0 bottom-0 w-px bg-ink-red opacity-40 z-0 print:hidden"></div>
      <div className="fixed left-10 sm:left-16 top-0 bottom-0 w-px bg-ink-red opacity-20 z-0 print:hidden"></div>

      {/* 메인 랩퍼 - 마진선 오른쪽으로 정렬 */}
      <div className="relative z-10 pl-12 sm:pl-20 print:pl-0 print:text-black">
        
        <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b-4 border-ink-red/30 pb-4 print:hidden">
          <div>
            <h1 className="font-hand text-5xl sm:text-6xl font-bold flex items-center gap-3 text-ink-blue transform -rotate-1">
              <PenTool size={42} className="text-ink-red" />
              Teacher's Note
            </h1>
            <p className="font-hand text-2xl text-gray-500 mt-2 ml-2">오늘의 과외 노트 필기</p>
          </div>
          
          <div className="flex flex-col sm:flex-row flex-wrap items-end gap-3 z-50">
            <div className="flex items-center gap-2 mb-1 sm:mb-0">
              <label className="font-sans text-sm text-gray-500 font-bold">폭 조절:</label>
              <select 
                value={containerWidth} 
                onChange={(e) => setContainerWidth(e.target.value)}
                className="rough-border-gray px-2 py-1 bg-white outline-none font-sans text-sm text-gray-700 cursor-pointer focus:ring-2 focus:ring-ink-red"
              >
                <option value="max-w-[600px]">600px</option>
                <option value="max-w-[800px]">800px</option>
                <option value="max-w-[1000px]">1000px (기본)</option>
                <option value="max-w-[1200px]">1200px</option>
                <option value="max-w-full">전체 화면</option>
              </select>
            </div>

            <div className="flex bg-paper/50 rough-border-gray px-2 py-1 items-center gap-1">
              <button
                onClick={() => setTtsMode('native')}
                className={`font-hand text-xl px-3 py-1 flex items-center gap-1 ${ttsMode === 'native' ? 'text-ink-red font-bold' : 'text-gray-500'}`}
              >
                <Monitor size={16} /> PC발음
              </button>
              <button
                onClick={() => setTtsMode('api')}
                className={`font-hand text-xl px-3 py-1 flex items-center gap-1 ${ttsMode === 'api' ? 'text-ink-red font-bold' : 'text-gray-500'}`}
              >
                <Cloud size={16} /> 과외쌤 발음
              </button>
            </div>
          </div>
        </header>

        {step === 'input' && (
          <div className="max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-10 print:hidden">
            
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="flex-1">
                <label className="block font-hand text-3xl font-bold mb-3 flex items-center gap-2">
                  <Star className="text-ink-red" />
                  학생 수준 (어휘 타겟팅)
                </label>
                <select
                  value={targetLevel}
                  onChange={(e) => setTargetLevel(e.target.value)}
                  className="rough-border w-full px-4 py-3 font-hand text-2xl outline-none focus:ring-2 focus:ring-ink-red bg-transparent cursor-pointer"
                >
                  {levelOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              <div className="flex-1">
                <label className="block font-hand text-3xl font-bold mb-3 flex items-center gap-2">
                  <Star className="text-ink-red" />
                  선생님 설명 강도 (단어량)
                </label>
                <select
                  value={detailLevel}
                  onChange={(e) => setDetailLevel(e.target.value)}
                  className="rough-border w-full px-4 py-3 font-hand text-2xl outline-none focus:ring-2 focus:ring-ink-red bg-transparent cursor-pointer"
                >
                  {detailOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-end mb-3">
                <label className="block font-hand text-3xl font-bold flex items-center gap-2">
                  <Star className="text-ink-red" />
                  지문을 여기에 적어주세요
                </label>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="font-hand text-2xl text-ink-red hover:text-red-800 flex items-center gap-1 rough-border-red px-3 py-1 bg-white"
                >
                  {isExtractingText ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
                  <span>{isExtractingText ? '글씨 읽는 중...' : '사진으로 붙여넣기'}</span>
                </button>
                <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
              </div>
              
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="여기에 영어 지문(원문)을 붙여넣으세요..."
                className="rough-border w-full h-[400px] p-6 font-sans text-xl leading-[36px] outline-none focus:ring-2 focus:ring-ink-blue bg-transparent resize-y"
              ></textarea>
            </div>

            {error && (
              <div className="rough-border-red p-4 font-hand text-2xl text-ink-red bg-red-50">
                삐빅! 선생님 말씀: {error}
              </div>
            )}

            <button
              onClick={analyzeText}
              disabled={!inputText.trim() || isExtractingText}
              className="rough-border bg-ink-blue text-white w-full py-4 font-hand text-4xl font-bold flex items-center justify-center gap-3 hover:bg-blue-800 transition-colors disabled:opacity-50 cursor-pointer"
            >
              선생님, 이 지문 과외해주세요! <ArrowRight size={28} />
            </button>
          </div>
        )}

        {step === 'loading' && (
          <div className="py-32 flex flex-col items-center justify-center space-y-6 animate-in fade-in print:hidden">
            <Loader2 size={64} className="animate-spin text-ink-red" />
            <h2 className="font-hand text-4xl font-bold text-ink-blue">선생님이 지문을 꼼꼼히 읽어보는 중...</h2>
            <p className="font-hand text-2xl text-gray-500">[{targetLevel}] 학생 수준에 맞춰 숙어와 어원을 샅샅이 파헤치고 있어요!</p>
          </div>
        )}

        {step === 'study' && (
          <>
            {/* === 웹 화면용 인터랙티브 레이아웃 (프린트시 숨김) === */}
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col xl:flex-row gap-12 items-start print:hidden">
              
              {/* 왼쪽: 본문 지문 */}
              <div className="w-full xl:w-[55%] space-y-6">
                <div className="flex flex-wrap items-center justify-between mb-4 gap-4">
                  <h2 className="font-hand text-4xl font-bold text-ink-red underline decoration-ink-red decoration-wavy underline-offset-8">
                    오늘의 지문
                  </h2>
                  <div className="flex flex-wrap gap-2 md:gap-4">
                    <button 
                      onClick={() => setShowTranslation(!showTranslation)}
                      className="rough-border px-4 py-2 font-hand text-2xl hover:bg-ink-blue hover:text-white transition-colors bg-white cursor-pointer"
                    >
                      {showTranslation ? '해석 가리기' : '해석 보기'}
                    </button>
                    <button 
                      onClick={() => window.print()}
                      className="rough-border-red px-4 py-2 font-hand text-2xl text-ink-red hover:bg-ink-red hover:text-white transition-colors bg-white cursor-pointer flex items-center gap-2"
                    >
                      <Printer size={20} /> 수업자료 인쇄
                    </button>
                    <button
                      onClick={resetToStart}
                      className="font-hand text-xl text-gray-500 hover:text-ink-blue underline self-end cursor-pointer pb-1 ml-2"
                    >
                      새 지문
                    </button>
                  </div>
                </div>

                <div className="mt-6">
                  {sentences.map((sent, idx) => (
                    <div key={idx} className="flex items-start gap-4 border-b-2 border-dashed border-gray-300 pb-8 mb-8">
                      <button
                        onClick={(e) => speak(sent.en, e)}
                        disabled={isPlayingAudio}
                        className={`mt-2 cursor-pointer flex-shrink-0 transition-colors bg-white rounded-full p-2 rough-border hover:bg-ink-blue hover:text-white ${isPlayingAudio ? 'text-gray-400 opacity-50' : 'text-ink-blue'}`}
                        title="이 문장 전체 발음 듣기"
                      >
                        {isPlayingAudio ? <Loader2 size={24} className="animate-spin" /> : <Volume2 size={24} />}
                      </button>
                      <div className="flex-1">
                        <p className="font-sans text-[22px] tracking-normal leading-[48px] mb-3 text-gray-900 font-medium">
                          {renderHighlightedSentence(sent.en)}
                        </p>
                        {showTranslation && (
                          <div className="mt-3 text-gray-700 bg-white/90 rough-border-gray p-4 inline-block animate-in fade-in slide-in-from-top-2 duration-300 transform -rotate-1">
                            <span className="font-sans text-lg whitespace-pre-wrap leading-[32px]">{sent.ko}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 오른쪽: 여백 주석(설명) */}
              <div className="w-full xl:w-[45%] rough-border p-6 sm:p-8 xl:sticky xl:top-8 bg-paper/90 shadow-sm">
                <h3 className="font-hand text-4xl font-bold mb-6 text-ink-red flex items-center gap-2">
                  <PenTool /> 핵심 콕콕!
                </h3>
                
                {activeItem ? (
                  <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="text-2xl font-bold bg-ink-red text-white px-3 py-1 inline-block mb-4 transform -rotate-2 shadow-sm">
                      {activeItem.phrase}
                      <span className="ml-2 text-sm font-normal bg-white/20 px-2 py-0.5 rounded-full inline-block align-middle pb-1">
                        {activeItem.type === 'idiom' ? '숙어/관용구' : activeItem.type === 'grammar' ? '문법구조' : '필수단어'}
                      </span>
                    </div>
                    
                    <div className="space-y-4 font-sans text-lg">
                      <p className="font-bold marker-highlight inline-block text-xl leading-pitch">{activeItem.title}</p>
                      <p className="text-gray-800 leading-pitch">{activeItem.explanation}</p>
                      
                      {(activeItem.etymology || activeItem.synonyms) && (
                        <div className="mt-4 pt-4 border-t-2 border-dashed border-gray-300 space-y-3">
                          {activeItem.etymology && (
                            <p className="text-gray-600 leading-pitch border-l-4 border-ink-blue pl-3">
                              <strong className="font-hand text-2xl text-ink-blue">어원/암기팁: </strong> 
                              {activeItem.etymology}
                            </p>
                          )}
                          {activeItem.synonyms && (
                            <p className="text-gray-600 leading-pitch">
                              <strong className="font-hand text-2xl text-ink-red">유의어: </strong> 
                              {activeItem.synonyms}
                            </p>
                          )}
                        </div>
                      )}

                      {activeItem.exampleEn && (
                        <div className="mt-6 p-4 rough-border-gray bg-gray-50/50 space-y-2 transform rotate-1">
                          <p className="font-sans text-xl font-medium text-ink-blue leading-snug text-center">
                            "{activeItem.exampleEn}"
                          </p>
                          <p className="text-gray-500 font-sans text-center mt-2">
                            ↳ {activeItem.exampleKo}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="py-20 text-center opacity-60">
                    <p className="font-hand text-3xl leading-pitch-double">
                      왼쪽 지문에서 노란색 형광펜이 칠해진<br/>
                      핵심 단어나 숙어 위로 마우스를 올려보렴!
                    </p>
                  </div>
                )}

                <button 
                  onClick={generateQuiz}
                  disabled={isQuizLoading}
                  className="cursor-pointer mt-12 w-full rough-border-red bg-ink-red text-white py-4 font-hand text-3xl font-bold hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isQuizLoading ? <Loader2 size={24} className="animate-spin" /> : <Star size={24} />}
                  {isQuizLoading ? '쪽지 시험 출제 중...' : '다 외웠어! 복습 쪽지시험 고고'}
                </button>
              </div>

            </div>

            {/* === 프린트 출력용 레이아웃 (웹에서는 숨김, 인쇄시 활성화) === */}
            <div className="hidden print:block font-sans text-black w-full bg-white text-sm pb-20">
              <h1 className="text-4xl font-bold border-b-4 border-black pb-4 mb-8 text-center tracking-tight">📝 오늘의 영어 리딩 및 핵심 분석 노트</h1>
              
              <section className="mb-14">
                <h2 className="text-2xl font-bold bg-gray-200 p-3 mb-6 inline-block w-full border-l-8 border-gray-600">📖 Part 1. 본문 및 해석</h2>
                <div className="space-y-6 px-4">
                  {sentences.map((sent, idx) => (
                    <div key={idx} className="pb-4 border-b border-gray-300 border-dashed">
                      <p className="text-xl font-bold text-black leading-relaxed mb-2 tracking-wide">{sent.en}</p>
                      <p className="text-lg text-gray-700 leading-relaxed font-medium">{sent.ko}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="break-before-page">
                <h2 className="text-2xl font-bold bg-gray-200 p-3 mb-6 inline-block w-full border-l-8 border-gray-600">🎯 Part 2. 핵심 영단어 및 관용구 (Voca & Idioms)</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full px-2">
                  {analysisResult.map((item, idx) => (
                    <div key={idx} className="border-2 border-gray-800 p-5 rounded-lg break-inside-avoid shadow-sm flex flex-col h-full">
                      <h3 className="text-xl font-extrabold text-black mb-3 pb-2 border-b-2 border-gray-200 flex items-center justify-between">
                        {item.title} 
                        <span className="text-xs font-bold text-gray-800 bg-gray-200 px-3 py-1 rounded-full">
                          {item.type === 'idiom' ? '숙어/표현' : item.type === 'grammar' ? '핵심문법' : '필수단어'}
                        </span>
                      </h3>
                      <div className="space-y-3 font-medium text-base flex-1">
                        <p className="text-gray-900 leading-relaxed"><strong className="text-black bg-gray-200 px-1">선명한 설명:</strong> {item.explanation}</p>
                        {item.etymology && (
                          <p className="text-gray-900 leading-relaxed"><strong className="text-black bg-gray-200 px-1">어원/암기팁:</strong> {item.etymology}</p>
                        )}
                        {item.synonyms && (
                          <p className="text-gray-800 leading-relaxed"><strong className="text-black bg-gray-200 px-1">유사어:</strong> {item.synonyms}</p>
                        )}
                      </div>
                      {item.exampleEn && (
                        <div className="bg-gray-100 p-4 mt-4 rounded-md border border-gray-300 mt-auto">
                          <p className="font-bold text-lg text-black mb-1 leading-snug">"{item.exampleEn}"</p>
                          <p className="text-gray-700 text-base leading-snug">↳ {item.exampleKo}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
              
              <div className="mt-16 pt-4 border-t-2 border-gray-400 text-center text-gray-500 font-bold text-base">
                <p>본 워크시트는 『AI Teacher's Note』를 통해 학생 수준(Target: {targetLevel})에 맞추어 자동 추출 및 설계되었습니다.</p>
              </div>
            </div>
          </>
        )}

        {step === 'quiz' && quizData.length > 0 && (
          <div className="max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10 print:hidden">
            <h2 className="font-hand text-5xl font-bold text-ink-red mb-6 flex items-center gap-3">
              <PenTool size={36} /> 과외 완료 쪽지 시험
              <span className="ml-auto font-sans text-xl bg-ink-red text-white px-4 py-1 rounded-full">
                {currentQ + 1} / {quizData.length}
              </span>
            </h2>
            
            <div className="w-full h-1 bg-gray-200 mb-10 overflow-hidden">
              <div className="h-full bg-ink-red transition-all duration-300" style={{ width: `${(currentQ / quizData.length) * 100}%` }}></div>
            </div>

            <div className="rough-border-red p-8 sm:p-12 mb-8 bg-paper">
              <h3 className="font-sans text-2xl text-gray-900 leading-pitch mb-10 font-medium">
                <span className="font-hand text-4xl text-ink-red mr-3 font-bold">Q.</span>
                {quizData[currentQ].question}
              </h3>

              <div className="space-y-4">
                {quizData[currentQ].options.map((opt, idx) => {
                  const isCorrectAnswer = idx === quizData[currentQ].answerIndex;
                  const isSelected = selectedAnswer === idx;
                  
                  let btnClass = "w-full text-left p-4 rough-border-gray transition-all font-sans text-xl flex items-center justify-between ";
                  
                  if (!showExplanation) {
                    btnClass += "hover:border-ink-blue hover:text-ink-blue cursor-pointer bg-white";
                  } else {
                    if (isCorrectAnswer) {
                      btnClass = "w-full text-left p-4 rough-border bg-blue-50 text-ink-blue font-bold flex items-center justify-between";
                    } else if (isSelected && !isCorrectAnswer) {
                      btnClass = "w-full text-left p-4 rough-border-red bg-red-50 text-ink-red font-bold flex items-center justify-between";
                    } else {
                      btnClass += "bg-gray-50 text-gray-300 opacity-50";
                    }
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => handleAnswerClick(idx)}
                      disabled={showExplanation}
                      className={btnClass}
                    >
                      <span className="font-sans font-medium text-xl pt-1">{opt}</span>
                      {showExplanation && isCorrectAnswer && <Check className="text-ink-blue" size={28} strokeWidth={3} />}
                      {showExplanation && isSelected && !isCorrectAnswer && <X className="text-ink-red" size={28} strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>

              {showExplanation && (
                <div className="mt-10 pt-8 border-t-2 border-dashed border-gray-300 animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className={`p-6 rough-border ${selectedAnswer === quizData[currentQ].answerIndex ? 'bg-blue-50 border-ink-blue' : 'bg-red-50 border-ink-red rough-border-red'}`}>
                    <h4 className={`font-hand text-3xl font-bold flex items-center gap-2 mb-3 ${selectedAnswer === quizData[currentQ].answerIndex ? 'text-ink-blue' : 'text-ink-red'}`}>
                      {selectedAnswer === quizData[currentQ].answerIndex ? '참 잘했어요! 동그라미! O' : '아이고 틀렸네! 별표 쳐둬! X'}
                    </h4>
                    <p className="font-sans text-lg leading-pitch text-gray-800">{quizData[currentQ].explanation}</p>
                  </div>
                  <button 
                    onClick={handleNextQ}
                    className="cursor-pointer mt-8 w-full py-4 rough-border bg-ink-blue text-white font-hand text-3xl font-bold hover:bg-blue-800 transition-all flex items-center justify-center gap-2"
                  >
                    <span>{currentQ < quizData.length - 1 ? '다음 문제로 넘어가기' : '채점 결과 보기'}</span>
                    <ChevronRight size={24} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'quiz_result' && (
          <div className="max-w-2xl mx-auto mt-12 rough-border-red p-12 bg-paper text-center animate-in zoom-in duration-500 transform rotate-1 print:hidden">
            <h2 className="text-6xl font-hand font-bold text-ink-red mb-4 underline decoration-wavy">
              채점 결과
            </h2>
            <div className="my-10">
              <span className="text-[120px] font-hand font-extrabold text-ink-red leading-none inline-block transform -rotate-6">
                {score * 20}
              </span>
              <span className="text-4xl font-hand text-gray-500 font-bold ml-2">점</span>
            </div>
            <p className="font-hand text-3xl text-gray-700 mb-12 leading-pitch-double">
              총 {quizData.length}문제 중에 <br/> <strong className="text-ink-blue text-4xl">{score}</strong>문제를 맞혔단다!
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={() => setStep('study')}
                className="cursor-pointer flex-1 py-4 rough-border font-hand text-3xl font-bold text-ink-blue hover:bg-blue-50 transition-colors bg-white"
              >
                지문 다시 보기
              </button>
              <button 
                onClick={resetToStart}
                className="cursor-pointer flex-1 py-4 rough-border-red bg-ink-red text-white font-hand text-3xl font-bold hover:bg-red-700 transition-colors"
              >
                다른 지문 공부하기
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
