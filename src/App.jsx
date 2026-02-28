import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut 
} from 'firebase/auth';
import { getFirestore, doc, setDoc, deleteDoc, collection, onSnapshot } from 'firebase/firestore';

import { 
  Calendar, BookOpen, Clock, BrainCircuit, ChevronRight, AlertCircle, Loader2, CalendarDays,
  Gauge, UploadCloud, FileText, X, LayoutDashboard, ListTodo, CheckCircle2, Circle,
  ChevronDown, ChevronUp, ChevronLeft, Plus, Trash2, Edit2, Flag, ArrowRight, Sparkles,
  Target, Palette, StickyNote, Save, BarChart3, TrendingUp, History, Tag, User, 
  ExternalLink, GraduationCap, MapPin, LogIn, LogOut, Mail, Lock, Cloud, CloudOff
} from 'lucide-react';

// --- Firebase Cloud Database Setup ---
// [Inference] Hardcoded to your custom project.
const firebaseConfig = {
  apiKey: "AIzaSyBAFxF6ybj4g1EpBathg0oGael7TnYBrWE",
  authDomain: "smartplanner-3838c.firebaseapp.com",
  projectId: "smartplanner-3838c",
  storageBucket: "smartplanner-3838c.firebasestorage.app",
  messagingSenderId: "461929417011",
  appId: "1:461929417011:web:c814b579543e89b1371646",
  measurementId: "G-4KYNCYKCJK"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "smartplanner-3838c";

const isConfigured = true;

// --- API Utilities ---
// [IMPORTANT] Paste your AIzaSyBM... Gemini key between these quotes on your local PC!

const fetchWithRetry = async (url, options, retries = 5) => {
  const delays = [1000, 2000, 4000, 8000, 16000];
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(res => setTimeout(res, delays[i]));
    }
  }
};

const generateStudyPlan = async (subjectName, syllabusText, fileData, startDate, endDate, dailyHours) => {
  // [Inference] Upgraded to gemini-1.5-pro, which is fully designed to handle application/pdf payloads.
  const url = `/api/generate`;
  
  const systemInstruction = `You are an expert academic study planner for the subject: "${subjectName}". 
Your task is to analyze a provided syllabus and create a realistic, day-by-day study schedule between the start date and end date.
First, extract the core topics from the provided material.
Crucially, you must evaluate the complexity of each topic. Allocate more time for topics you infer to be hard, and less time for easy topics. 
Do not exceed the user's daily study hours.
IMPORTANT: If a topic is 'Easy', but the user's Max Daily Study Hours is higher than needed, provide a 'suggestion' (hasSuggestion: true) with a 'message' and a 'suggestedHours'.
Return the schedule STRICTLY matching the provided JSON schema.`;

  const parts = [];
  if (fileData) {
    parts.push({ inlineData: { mimeType: fileData.mimeType, data: fileData.data } });
    parts.push({ text: "Please carefully extract and organize the syllabus topics from the provided PDF document." });
  }
  if (syllabusText && syllabusText.trim()) {
    parts.push({ text: `Additional Syllabus Text:\n${syllabusText}` });
  }
  parts.push({ text: `\nParameters:\nStart Date: ${startDate}\nEnd Date: ${endDate}\nMax Daily Study Hours: ${dailyHours}` });

  const payload = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ parts: parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          schedule: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                date: { type: "STRING" },
                dayNumber: { type: "INTEGER" },
                totalHoursScheduled: { type: "NUMBER" },
                topics: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      topicName: { type: "STRING" },
                      difficulty: { type: "STRING" },
                      allocatedHours: { type: "NUMBER" },
                      reasoning: { type: "STRING" },
                      suggestion: {
                        type: "OBJECT",
                        properties: {
                          hasSuggestion: { type: "BOOLEAN" },
                          message: { type: "STRING" },
                          suggestedHours: { type: "NUMBER" }
                        }
                      }
                    },
                    required: ["topicName", "difficulty", "allocatedHours", "reasoning"]
                  }
                }
              },
              required: ["date", "dayNumber", "totalHoursScheduled", "topics"]
            }
          }
        },
        required: ["schedule"]
      }
    }
  };

  const result = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textResponse) throw new Error("Failed to parse AI response. Check API quotas or payload formatting.");
  
  const parsed = JSON.parse(textResponse);
  return { ...parsed, id: Date.now().toString(), subjectName };
};

// --- Sub-Components ---

const DifficultyBadge = ({ level }) => {
  const colors = {
    'Easy': 'bg-green-100 text-green-800 border-green-200',
    'Medium': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'Hard': 'bg-red-100 text-red-800 border-red-200'
  };
  const style = colors[level] || 'bg-gray-100 text-gray-800 border-gray-200';
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${style} flex items-center gap-1 w-max`}>
      <Gauge size={12} /> {level}
    </span>
  );
};

const HomeView = ({ setActiveTab, setTheme, currentTheme }) => {
  const themesRef = useRef(null);
  const allThemes = ['light', 'dark', 'cyber', 'modern', 'pastel', 'midnight', 'forest', 'sunset'];
  const scrollToThemes = () => themesRef.current?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="space-y-16 pb-20 animate-in fade-in duration-500">
      <div className="text-center py-16 px-4 bg-white rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-2xl h-64 bg-indigo-50 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
        <div className="relative z-10 max-w-3xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-sm font-semibold mb-4"><Sparkles size={16} /><span>All-In-One Study Hub</span></div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">Master your syllabus with <br className="hidden md:block" /> intelligent scheduling.</h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">Upload multiple courseworks and let AI organize your study days. Group your tasks by subject and stay on top of daily goals.</p>
          <div className="pt-4 flex items-center justify-center gap-4 flex-wrap">
            <button onClick={() => setActiveTab('planner')} className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-sm transition-all hover:-translate-y-0.5">Start Planning Now <ArrowRight size={20} /></button>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2 px-2"><Sparkles className="text-indigo-500" size={24} />Explore Features</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div onClick={() => setActiveTab('planner')} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 hover:border-indigo-400 hover:shadow-md cursor-pointer transition-all hover:-translate-y-1 group relative">
            <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400"><ArrowRight size={20} /></div>
            <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform"><BrainCircuit size={24} /></div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Multi-Subject AI Planner</h3>
            <p className="text-slate-600 text-sm leading-relaxed">Upload multiple subjects. The AI uses <strong>[Inference]</strong> to break down topics without overwriting previous subject data.</p>
          </div>
          <div onClick={() => setActiveTab('calendar')} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 hover:border-indigo-400 hover:shadow-md cursor-pointer transition-all hover:-translate-y-1 group relative">
            <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400"><ArrowRight size={20} /></div>
            <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform"><CalendarDays size={24} /></div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Aggregated Calendar</h3>
            <p className="text-slate-600 text-sm leading-relaxed">View all scheduled topics from all subjects in one global calendar view.</p>
          </div>
          <div onClick={() => setActiveTab('todo')} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 hover:border-indigo-400 hover:shadow-md cursor-pointer transition-all hover:-translate-y-1 group relative">
            <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400"><ArrowRight size={20} /></div>
            <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform"><ListTodo size={24} /></div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Priority Task Groups</h3>
            <p className="text-slate-600 text-sm leading-relaxed">Your to-do list groups tasks by subject. Today's items are always pinned at the top.</p>
          </div>
          <div onClick={() => setActiveTab('notes')} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 hover:border-indigo-400 hover:shadow-md cursor-pointer transition-all hover:-translate-y-1 group relative">
            <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400"><ArrowRight size={20} /></div>
            <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform"><StickyNote size={24} /></div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Subject Notes</h3>
            <p className="text-slate-600 text-sm leading-relaxed">A dedicated area to jot down notes for each subject separately.</p>
          </div>
          <div onClick={() => setActiveTab('history')} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 hover:border-indigo-400 hover:shadow-md cursor-pointer transition-all hover:-translate-y-1 group relative">
            <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400"><ArrowRight size={20} /></div>
            <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform"><BarChart3 size={24} /></div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">History & Analysis</h3>
            <p className="text-slate-600 text-sm leading-relaxed">Analyze performance across all subjects. See what you finished and what's left behind.</p>
          </div>
          <div onClick={scrollToThemes} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 hover:border-indigo-400 hover:shadow-md cursor-pointer transition-all hover:-translate-y-1 group relative">
            <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400"><ChevronDown size={20} /></div>
            <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform"><Palette size={24} /></div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Dynamic Themes</h3>
            <p className="text-slate-600 text-sm leading-relaxed">Customize your hub with one of our eight beautiful themes.</p>
          </div>
        </div>
      </div>

      <div className="bg-indigo-900 text-white rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-800 rounded-full blur-3xl opacity-20 -mr-20 -mt-20"></div>
        <div className="relative z-10 grid md:grid-cols-2 gap-8 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 bg-indigo-800/50 border border-indigo-700 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider">
              <User size={14} /> Meet the Developer
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">Ritik Raj</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-indigo-200">
                <GraduationCap size={20} className="shrink-0" />
                <span className="font-medium">SRM KTR, 1st Year Student</span>
              </div>
              <div className="flex items-center gap-3 text-indigo-200">
                <MapPin size={20} className="shrink-0" />
                <span className="font-medium text-sm">Kattankulathur, Tamil Nadu</span>
              </div>
            </div>
            <p className="text-indigo-100/80 leading-relaxed text-sm max-w-md italic">
              "Driven by a passion for creating intelligent solutions that simplify academic life. This SmartPlanner is a project designed to help students like myself manage complex curriculums with the power of AI."
            </p>
            <div className="pt-2">
              <a 
                href="https://redx7988.github.io/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-white text-indigo-900 px-6 py-3 rounded-xl font-bold transition-all hover:scale-105 hover:bg-indigo-50 shadow-lg"
              >
                Visit Portfolio <ExternalLink size={18} />
              </a>
            </div>
          </div>
          <div className="hidden md:flex justify-center items-center">
            <div className="relative">
              <div className="w-48 h-48 bg-indigo-700 rounded-3xl rotate-12 absolute inset-0 blur-sm opacity-50 group-hover:rotate-6 transition-transform"></div>
              <div className="w-48 h-48 bg-indigo-600 rounded-3xl -rotate-6 absolute inset-0 blur-sm opacity-50 group-hover:rotate-0 transition-transform"></div>
              <div className="w-48 h-48 bg-indigo-500 rounded-3xl flex items-center justify-center relative border-4 border-white group-hover:scale-105 transition-transform">
                <BrainCircuit size={80} className="text-white animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div ref={themesRef} className="space-y-8 animate-in slide-in-from-bottom-4 duration-700">
        <div className="text-center space-y-2"><h2 className="text-3xl font-extrabold text-slate-900 flex items-center justify-center gap-3"><Palette className="text-indigo-600" size={32} />Personalize Your Hub</h2><p className="text-slate-500 max-w-lg mx-auto">Select a theme that matches your current study environment.</p></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-2">{allThemes.map(t => (
            <button key={t} onClick={() => setTheme(t)} className={`p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-4 group ${currentTheme === t ? 'bg-indigo-600 text-white border-indigo-600 shadow-xl scale-105' : 'bg-white text-slate-700 border-slate-100 hover:border-indigo-300 hover:shadow-lg'}`}><div className={`w-12 h-12 rounded-full border-4 border-white shadow-sm flex items-center justify-center transition-transform group-hover:rotate-12 ${t === 'light' ? 'bg-slate-100' : ''} ${t === 'dark' ? 'bg-slate-800' : ''} ${t === 'cyber' ? 'bg-green-500' : ''} ${t === 'modern' ? 'bg-indigo-400' : ''} ${t === 'pastel' ? 'bg-pink-200' : ''} ${t === 'midnight' ? 'bg-blue-900' : ''} ${t === 'forest' ? 'bg-emerald-800' : ''} ${t === 'sunset' ? 'bg-orange-500' : ''}`}>{currentTheme === t && <CheckCircle2 size={24} />}</div><span className="font-bold capitalize text-sm">{t} Theme</span></button>
          ))}</div>
      </div>

      <div className="bg-amber-50 p-6 rounded-2xl border border-amber-200 flex gap-4 items-start"><AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={24} /><div><h3 className="text-amber-800 font-bold mb-2">[Unverified] Expected AI Behavior</h3><p className="text-amber-700 text-sm leading-relaxed">Topic extraction and difficulty estimations are <strong>[Inference]</strong> based on academic knowledge. This is expected behavior, not a guaranteed absolute truth regarding specific demands.</p></div></div>
    </div>
  );
};

const CustomDatePicker = ({ value, onChange, minDate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date(value || new Date()));
  useEffect(() => { if (value) setCurrentMonth(new Date(value)); }, [value]);
  const getLocalYYYYMMDD = (d) => { const date = new Date(d); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
  const nextMonth = (e) => { e.preventDefault(); setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)); };
  const prevMonth = (e) => { e.preventDefault(); setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)); };
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const blanks = Array(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay()).fill(null);
  const days = Array.from({ length: new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate() }, (_, i) => i + 1);
  const totalSlots = [...blanks, ...days];

  return (
    <div className="relative w-full">
      <div onClick={() => setIsOpen(!isOpen)} className="w-full pl-9 p-2.5 rounded-xl border border-slate-300 bg-white hover:border-indigo-300 cursor-pointer flex items-center min-h-[46px] transition-colors"><CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><span className="text-slate-700 text-sm">{value || "Select date"}</span></div>
      {isOpen && (<><div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div><div className="absolute left-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden z-50 p-4"><div className="flex justify-between items-center mb-4"><button onClick={prevMonth} className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"><ChevronLeft size={16} /></button><span className="font-bold text-slate-800 text-sm">{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</span><button onClick={nextMonth} className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"><ChevronRight size={16} /></button></div><div className="grid grid-cols-7 gap-1 mb-2">{dayNames.map(d => <div key={d} className="text-center text-[10px] font-bold text-slate-400">{d}</div>)}</div><div className="grid grid-cols-7 gap-1">{totalSlots.map((day, idx) => { if (!day) return <div key={`blank-${idx}`} className="h-8"></div>; const cellDateStr = getLocalYYYYMMDD(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)); const isSelected = value === cellDateStr; const isToday = cellDateStr === getLocalYYYYMMDD(new Date()); const isDisabled = minDate && cellDateStr < minDate; return (<button key={day} disabled={isDisabled} onClick={(e) => { e.preventDefault(); if (!isDisabled) { onChange(cellDateStr); setIsOpen(false); } }} className={`h-8 rounded-lg text-xs font-medium flex items-center justify-center transition-all ${isDisabled ? 'text-slate-300 cursor-not-allowed opacity-40' : isSelected ? 'bg-indigo-600 text-white shadow-sm' : isToday ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-100'}`}>{day}</button>) })}</div></div></>)}
    </div>
  );
};

const TodoView = ({ todos, toggleTodo, customTodos, addCustomTodo, toggleCustomTodo, deleteCustomTodo, editCustomTodo }) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const [isMasterOpen, setIsMasterOpen] = useState(true);
  const [newTask, setNewTask] = useState('');
  const [newPriority, setNewPriority] = useState('Medium');
  const [newDueDate, setNewDueDate] = useState(todayStr);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  const priorityWeight = { 'High': 1, 'Medium': 2, 'Low': 3 };
  const sortTasks = (a, b) => (a.completed !== b.completed) ? (a.completed ? 1 : -1) : (priorityWeight[a.priority] - priorityWeight[b.priority]);

  const sortedMasterTodos = [...todos].sort((a, b) => {
    const isTodayA = a.date === todayStr;
    const isTodayB = b.date === todayStr;
    if (isTodayA !== isTodayB) return isTodayA ? -1 : 1;
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return a.subjectName.localeCompare(b.subjectName);
  });

  const overdueTasks = customTodos.filter(t => t.dueDate < todayStr && !t.completed).sort(sortTasks);
  const todayTasks = customTodos.filter(t => t.dueDate === todayStr).sort(sortTasks);
  const upcomingTasks = customTodos.filter(t => t.dueDate > todayStr).sort(sortTasks);

  const getPriorityStyle = (p) => p === 'High' ? 'bg-red-100 text-red-700 border-red-200' : p === 'Medium' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' : 'bg-blue-100 text-blue-700 border-blue-200';

  const renderTaskList = (tasks, emptyMsg) => tasks.length === 0 ? <div className="text-sm text-slate-400 italic py-2">{emptyMsg}</div> : (
    <div className="space-y-3">{tasks.map(todo => (
      <div key={todo.id} className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${todo.completed ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white border-slate-200 shadow-sm'}`}>
        <button onClick={() => toggleCustomTodo(todo.id)} className="shrink-0 mt-0.5">{todo.completed ? <CheckCircle2 className="text-green-500" size={20} /> : <Circle className="text-slate-300 hover:text-indigo-400 transition-colors" size={20} />}</button>
        <div className="flex-1 min-w-0">{editingId === todo.id ? <input value={editText} onChange={(e) => setEditText(e.target.value)} onBlur={() => { if (editText.trim()) editCustomTodo(todo.id, editText); setEditingId(null); }} onKeyDown={(e) => e.key === 'Enter' && setEditingId(null)} autoFocus className="w-full p-1 border-b-2 border-indigo-500 outline-none bg-transparent text-sm"/> : <p className={`font-medium text-sm break-words ${todo.completed ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{todo.text}</p>}
          <div className="flex items-center gap-2 mt-2"><span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border flex items-center gap-1 ${getPriorityStyle(todo.priority)}`}><Flag size={10} /> {todo.priority}</span><span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md font-medium border border-slate-200">{todo.dueDate}</span></div>
        </div>
        <div className="flex items-center gap-1 shrink-0">{editingId !== todo.id && <button onClick={() => { setEditingId(todo.id); setEditText(todo.text); }} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Edit2 size={16} /></button>}<button onClick={() => deleteCustomTodo(todo.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button></div>
      </div>
    ))}</div>
  );

  const subjects = [...new Set(sortedMasterTodos.map(t => t.subjectName))];

  return (
    <div className="flex flex-col gap-6 h-full min-h-[400px]">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start flex-1">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col max-h-[700px]">
          <button onClick={() => setIsMasterOpen(!isMasterOpen)} className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors shrink-0">
            <div className="flex items-center gap-3"><ListTodo className="text-indigo-500" /><h2 className="text-xl font-bold text-slate-800">Master To-Do List</h2><span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200 ml-2 hidden xl:inline-block">* Multi-Subject</span></div>
            <div className="flex items-center gap-3 text-slate-500"><span className="text-sm font-medium bg-slate-100 px-2 py-1 rounded-md">{todos.length} Tasks</span>{isMasterOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>
          </button>
          {isMasterOpen && (
            <div className="p-5 border-t border-slate-200 bg-slate-50/50 overflow-y-auto space-y-6">
              {sortedMasterTodos.length === 0 ? <div className="text-center text-slate-500 py-8">No AI plans generated yet.</div> : (
                subjects.map(subject => (
                  <div key={subject} className="space-y-3">
                    <h3 className="text-xs font-bold text-indigo-500 uppercase tracking-widest border-b border-indigo-100 pb-1 flex justify-between items-center">
                      <span>{subject}</span>
                      <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">Grouped</span>
                    </h3>
                    {sortedMasterTodos.filter(t => t.subjectName === subject).map(todo => (
                      <div key={todo.id} onClick={() => toggleTodo(todo.id)} className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${todo.completed ? 'bg-slate-100 border-slate-200 opacity-60' : todo.date === todayStr ? 'bg-indigo-50 border-indigo-300 shadow-md ring-2 ring-indigo-100' : 'bg-white border-slate-200 hover:border-indigo-300 shadow-sm'}`}>
                        {todo.completed ? <CheckCircle2 className="text-green-500 shrink-0" /> : <Circle className="text-slate-300 shrink-0" />}
                        <div className="flex-1">
                          <p className={`font-medium ${todo.completed ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{todo.text}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {todo.date === todayStr && <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-bold animate-pulse">TODAY</span>}
                            <p className="text-[10px] text-slate-500">{todo.date} • {todo.allocatedHours} hrs</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200"><h3 className="text-lg font-bold text-indigo-600 flex items-center gap-2 mb-4"><CalendarDays size={20} /> Today's Personal Tasks</h3>{renderTaskList(todayTasks, "No personal tasks for today.")}</div>
          {overdueTasks.length > 0 && (<div className="bg-red-50/30 p-6 rounded-2xl border border-red-100"><h3 className="text-lg font-bold text-red-600 flex items-center gap-2 mb-4"><AlertCircle size={20} /> Overdue Tasks</h3>{renderTaskList(overdueTasks, "No overdue tasks.")}</div>)}
          {upcomingTasks.length > 0 && (<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200"><h3 className="text-lg font-bold text-slate-500 flex items-center gap-2 mb-4"><Clock size={20} /> Upcoming Tasks</h3>{renderTaskList(upcomingTasks, "No upcoming tasks.")}</div>)}
        </div>
      </div>
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mt-auto"><h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Plus className="text-indigo-500" size={20} />Create New Personal Task</h2>
        <form onSubmit={(e) => { e.preventDefault(); if (newTask.trim()) { addCustomTodo(newTask, newPriority, newDueDate); setNewTask(''); } }} className="flex flex-col lg:flex-row gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="What do you need to do?" className="flex-1 p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"/>
          <div className="flex flex-col sm:flex-row gap-3"><div className="w-full sm:w-44 shrink-0"><CustomDatePicker value={newDueDate} minDate={todayStr} onChange={setNewDueDate}/></div>
            <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)} className="w-full sm:w-auto p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white text-slate-700"><option value="High">High</option><option value="Medium">Medium</option><option value="Low">Low</option></select>
            <button type="submit" disabled={!newTask.trim()} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold gap-2 shrink-0">Add</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const CalendarView = ({ plans, dailySchedules, addDailySchedule, deleteDailySchedule }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const getLocalYYYYMMDD = (d) => { const date = new Date(d); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
  const [selectedDateStr, setSelectedDateStr] = useState(getLocalYYYYMMDD(new Date()));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [activity, setActivity] = useState('');
  const [scheduleError, setScheduleError] = useState('');

  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const blanks = Array(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay()).fill(null);
  const days = Array.from({ length: new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate() }, (_, i) => i + 1);
  const totalSlots = [...blanks, ...days];

  const selectedDayTopics = plans.flatMap(plan => {
    const day = plan.schedule.find(d => d.date === selectedDateStr);
    return day ? day.topics.map(t => ({ ...t, subjectName: plan.subjectName })) : [];
  });
  const selectedDaySchedules = dailySchedules[selectedDateStr] || [];

  return (
    <div className="flex flex-col md:flex-row gap-6 h-full items-start relative">
      <div className="flex-1 flex flex-col gap-6 order-2 md:order-1 h-full w-full min-w-0">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex-1 flex flex-col"><h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4"><ListTodo className="text-indigo-500" size={18} />My Time Table</h3>
          {selectedDaySchedules.length === 0 ? (<p className="text-sm text-slate-500 italic py-8 text-center border border-dashed border-slate-200 rounded-xl flex-1 flex items-center justify-center">No custom schedule set for this date.</p>) : (
            <div className="space-y-3 overflow-y-auto pr-1 flex-1 max-h-80">{selectedDaySchedules.map((item) => (
              <div key={item.id} className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl shadow-sm group hover:border-indigo-200 transition-colors">
                <div className="text-xs font-bold text-slate-500 w-20 shrink-0 pt-0.5 border-r border-slate-200 pr-2"><div className="text-indigo-600">{item.startTime}</div><div className="text-slate-400 mt-1">{item.endTime}</div></div>
                <div className="flex-1 pl-2"><p className="text-base font-medium text-slate-800">{item.activity}</p></div>
                <button onClick={() => deleteDailySchedule(selectedDateStr, item.id)} className="text-slate-300 hover:text-red-500 transition-colors p-2 bg-white rounded-lg shadow-sm opacity-0 group-hover:opacity-100 focus:opacity-100"><Trash2 size={16} /></button>
              </div>))}
            </div>)}
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200"><div className="flex justify-between items-center mb-4"><h3 className="font-bold text-slate-800 flex items-center gap-2"><BrainCircuit className="text-indigo-500" size={18} />Combined AI Topics</h3><span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">[Inference] Total Log</span></div>
          {selectedDayTopics.length === 0 ? (<p className="text-sm text-slate-500 italic py-4 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">No AI topics from any subject for this date.</p>) : (
            <div className="space-y-4">
              {selectedDayTopics.map((t, idx) => (
                <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm">
                  <div className="flex justify-between items-center mb-2"><span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">{t.subjectName}</span><DifficultyBadge level={t.difficulty} /></div>
                  <div className="font-medium text-slate-800 mb-1">{t.topicName}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-1"><Clock size={12} /> {t.allocatedHours} hrs</div>
                </div>
              ))}
            </div>)}
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mt-auto"><h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4 text-sm"><Plus className="text-indigo-500" size={16} />Add to Schedule</h3>
          <form onSubmit={(e) => { e.preventDefault(); if (activity.trim() && startTime && endTime) { if (startTime >= endTime) { setScheduleError('End time must be after start time.'); return; } const hasOverlap = dailySchedules[selectedDateStr]?.some(i => startTime < i.endTime && endTime > i.startTime); if (hasOverlap) { setScheduleError('Time overlap detected.'); return; } setScheduleError(''); addDailySchedule(selectedDateStr, startTime, endTime, activity); setActivity(''); } }} className="flex flex-col sm:flex-row gap-3"><div className="flex items-center gap-2 shrink-0"><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required className="p-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50"/><span className="text-slate-400 text-sm font-medium">to</span><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required className="p-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50"/></div>
            <div className="flex items-center gap-2 flex-1"><input type="text" placeholder="Activity..." value={activity} onChange={(e) => setActivity(e.target.value)} required className="flex-1 p-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50"/><button type="submit" disabled={!activity.trim()} className="bg-indigo-600 hover:bg-indigo-700 text-white p-2.5 rounded-lg transition-colors shrink-0"><Plus size={20} /></button></div>
          </form>
          {scheduleError && (<div className="mt-3 p-2 bg-red-50 text-red-700 rounded-lg text-xs flex items-center gap-1.5 border border-red-100 animate-bounce"><AlertCircle size={14} className="shrink-0" /><span>{scheduleError}</span></div>)}
        </div>
      </div>
      <div className="w-full md:w-80 lg:w-[340px] shrink-0 bg-white p-5 rounded-2xl shadow-sm border border-slate-200 order-1 md:order-2 md:sticky md:top-24 z-10">
        <div className="flex flex-col items-center mb-6 gap-3"><h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 w-full justify-center"><CalendarDays className="text-indigo-500" size={20} />Global Calendar</h2><div className="flex items-center justify-between w-full bg-slate-50 rounded-xl border border-slate-200 p-1"><button onClick={prevMonth} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-600"><ChevronLeft size={16} /></button><span className="font-bold text-slate-800 text-sm text-center">{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</span><button onClick={nextMonth} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-600"><ChevronRight size={16} /></button></div></div>
        <div className="grid grid-cols-7 gap-1 mb-2">{dayNames.map(day => (<div key={day} className="text-center font-bold text-[10px] text-slate-400 uppercase tracking-wider py-1">{day.slice(0, 2)}</div>))}</div>
        <div className="grid grid-cols-7 gap-1">{totalSlots.map((day, idx) => { if (!day) return <div key={`blank-${idx}`} className="h-10 md:h-12 rounded-lg border border-transparent"></div>; const cellDateStr = getLocalYYYYMMDD(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)); const isSelected = selectedDateStr === cellDateStr; const isToday = cellDateStr === getLocalYYYYMMDD(new Date()); const hasAiPlan = plans.some(p => p.schedule.some(d => d.date === cellDateStr)); const hasCustom = (dailySchedules[cellDateStr] || []).length > 0;
            return (<div key={day} onClick={() => setSelectedDateStr(cellDateStr)} className={`h-10 md:h-12 rounded-lg border transition-all cursor-pointer flex flex-col items-center justify-center relative group ${isSelected ? 'bg-indigo-50 border-indigo-400 shadow-sm ring-1 ring-indigo-400' : 'bg-slate-50 border-slate-200 hover:border-indigo-300 hover:bg-slate-100'}`}><span className={`text-xs md:text-sm font-semibold flex items-center justify-center rounded-full ${isToday ? 'bg-indigo-600 text-white w-6 h-6' : isSelected ? 'text-indigo-700 w-6 h-6 bg-white shadow-sm' : 'text-slate-700'}`}>{day}</span><div className="flex gap-1 absolute bottom-1 md:bottom-1.5">{hasAiPlan && <div className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-indigo-400"></div>}{hasCustom && <div className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-amber-400"></div>}</div></div>); })}
        </div>
      </div>
    </div>
  );
};

const NotesView = ({ notes, setNotes }) => {
  const [activeNoteId, setActiveNoteId] = useState(null);
  const activeNote = notes.find(n => n.id === activeNoteId);
  const handleCreateNote = () => { const newNote = { id: Date.now().toString(), title: 'New Subject', content: '', date: new Date().toISOString().split('T')[0] }; setNotes(newNote); setActiveNoteId(newNote.id); };
  const handleUpdateNote = (field, value) => { setNotes({ ...activeNote, [field]: value, lastEdited: new Date().toLocaleTimeString() }, true); };
  const handleDeleteNote = (e, id) => { e.stopPropagation(); setNotes({ id }, false, true); if (activeNoteId === id) setActiveNoteId(null); };

  return (
    <div className="flex flex-col md:flex-row gap-6 h-full min-h-[600px] items-start relative">
      <div className="w-full md:w-80 shrink-0 flex flex-col gap-4 order-2 md:order-1 h-[400px] md:h-auto md:sticky md:top-24"><button onClick={handleCreateNote} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-2xl shadow-sm transition-colors flex items-center justify-center font-bold gap-2"><Plus size={20} />Create New Note</button>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden"><div className="p-4 border-b border-slate-100 bg-slate-50/50"><h3 className="font-bold text-slate-800 flex items-center gap-2"><StickyNote className="text-indigo-500" size={18} />My Notes</h3></div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[400px] md:max-h-[600px]">
            {notes.length === 0 ? (<p className="text-sm text-slate-400 italic text-center py-8">No notes created yet.</p>) : (
              notes.map(note => (<div key={note.id} onClick={() => setActiveNoteId(note.id)} className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start justify-between group ${activeNoteId === note.id ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-300' : 'bg-white border-slate-200 hover:border-indigo-200 hover:bg-slate-50'}`}><div className="flex-1 min-w-0 pr-2"><h4 className={`font-semibold text-sm truncate ${activeNoteId === note.id ? 'text-indigo-900' : 'text-slate-800'}`}>{note.title || 'Untitled'}</h4><p className="text-xs text-slate-500 mt-1 truncate">{note.content ? note.content.substring(0, 30) + '...' : 'No content'}</p></div><button onClick={(e) => handleDeleteNote(e, note.id)} className={`p-1.5 rounded-lg transition-colors shrink-0 ${activeNoteId === note.id ? 'text-indigo-400 hover:text-red-500 hover:bg-white' : 'text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100'}`} title="Delete note"><Trash2 size={16} /></button></div>))
            )}
          </div>
        </div>
      </div>
      <div className="flex-1 w-full flex flex-col order-1 md:order-2 bg-white rounded-2xl shadow-sm border border-slate-200 min-h-[500px] overflow-hidden">
        {!activeNote ? (<div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8"><StickyNote size={64} className="mb-4 text-slate-200" /><h3 className="text-xl font-medium text-slate-600 mb-2">No Note Selected</h3><p className="text-sm max-w-sm text-center">Select a note from the sidebar to edit.</p></div>) : (
          <div className="flex-1 flex flex-col animate-in fade-in duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center gap-4 bg-slate-50/30"><input type="text" value={activeNote.title} onChange={(e) => handleUpdateNote('title', e.target.value)} placeholder="Subject Name..." className="flex-1 text-2xl font-bold text-slate-900 bg-transparent border-none outline-none placeholder:text-slate-300"/><div className="flex items-center gap-2 text-xs font-medium text-slate-400 shrink-0 px-3 py-1.5 bg-white rounded-lg border border-slate-200"><Save size={14} className="text-emerald-500" />Saved</div></div>
            <textarea value={activeNote.content} onChange={(e) => handleUpdateNote('content', e.target.value)} placeholder="Write notes here..." className="flex-1 p-6 w-full resize-none bg-transparent outline-none text-slate-700 leading-relaxed"/>
            <div className="p-4 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400 bg-slate-50/50"><span>Created: {activeNote.date}</span>{activeNote.lastEdited && <span>Last edited: {activeNote.lastEdited}</span>}</div>
          </div>)}
      </div>
    </div>
  );
};

const HistoryView = ({ plans, customTodos, todos, dailySchedules }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const getLocalYYYYMMDD = (d) => { const date = new Date(d); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
  const [selectedDateStr, setSelectedDateStr] = useState(getLocalYYYYMMDD(new Date()));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const blanks = Array(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay()).fill(null);
  const days = Array.from({ length: new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate() }, (_, i) => i + 1);
  const totalSlots = [...blanks, ...days];

  const daySchedules = dailySchedules[selectedDateStr] || [];
  const dayPlanTopics = plans.flatMap(p => {
    const day = p.schedule.find(d => d.date === selectedDateStr);
    return day ? day.topics.map(t => ({ ...t, subjectName: p.subjectName })) : [];
  });
  
  const dayCustomTodos = customTodos.filter(t => t.dueDate === selectedDateStr);
  const dayAiTodos = todos.filter(t => t.date === selectedDateStr);
  const allDayTodos = [...dayCustomTodos, ...dayAiTodos];
  
  const completedCount = allDayTodos.filter(t => t.completed).length;
  const totalCount = allDayTodos.length;
  const completionRate = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full items-start relative">
      <div className="w-full lg:w-80 shrink-0 bg-white p-5 rounded-2xl shadow-sm border border-slate-200 order-1 lg:sticky lg:top-24 z-10">
        <div className="flex flex-col items-center mb-6 gap-3">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 w-full justify-center"><History className="text-indigo-500" size={20} />Filter History</h2>
          <div className="flex items-center justify-between w-full bg-slate-50 rounded-xl border border-slate-200 p-1">
            <button onClick={prevMonth} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-600"><ChevronLeft size={16} /></button>
            <span className="font-bold text-slate-800 text-sm text-center">{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</span>
            <button onClick={nextMonth} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-600"><ChevronRight size={16} /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-2">{dayNames.map(day => (<div key={day} className="text-center font-bold text-[10px] text-slate-400 uppercase tracking-wider py-1">{day}</div>))}</div>
        <div className="grid grid-cols-7 gap-1">{totalSlots.map((day, idx) => { if (!day) return <div key={`blank-${idx}`} className="h-10 rounded-lg border border-transparent"></div>; const cellDateStr = getLocalYYYYMMDD(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)); const isSelected = selectedDateStr === cellDateStr; const hasData = (dailySchedules[cellDateStr]?.length > 0) || plans.some(p => p.schedule.some(d => d.date === cellDateStr)) || customTodos.some(t => t.dueDate === cellDateStr); return (<div key={day} onClick={() => setSelectedDateStr(cellDateStr)} className={`h-10 rounded-lg border transition-all cursor-pointer flex flex-col items-center justify-center relative group ${isSelected ? 'bg-indigo-50 border-indigo-400 shadow-sm ring-1 ring-indigo-400' : 'bg-slate-50 border-slate-200 hover:border-indigo-300'}`}><span className={`text-sm font-semibold flex items-center justify-center rounded-full ${cellDateStr === getLocalYYYYMMDD(new Date()) ? 'bg-indigo-600 text-white w-7 h-7' : isSelected ? 'text-indigo-700 w-7 h-7 bg-white shadow-sm' : 'text-slate-700'}`}>{day}</span>{hasData && (<div className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-emerald-400"></div>)}</div>); })}</div>
      </div>
      <div className="flex-1 flex flex-col gap-6 order-2 w-full min-w-0">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div><h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><BarChart3 className="text-indigo-500" />Analysis Dashboard</h2><p className="text-slate-500 text-sm mt-1">Showing all subject data for <span className="font-semibold text-indigo-600">{new Date(selectedDateStr).toLocaleDateString()}</span></p></div>
          <div className="flex items-center gap-4 bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 w-full md:w-auto"><div className="w-12 h-12 relative flex items-center justify-center"><svg className="w-full h-full transform -rotate-90"><circle cx="24" cy="24" r="20" fill="transparent" stroke="currentColor" strokeWidth="4" className="text-slate-200" /><circle cx="24" cy="24" r="20" fill="transparent" stroke="currentColor" strokeWidth="4" strokeDasharray="125.6" strokeDashoffset={125.6 - (125.6 * completionRate) / 100} className="text-indigo-600" /></svg><span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-700">{completionRate}%</span></div><div><div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Completion</div><div className="font-bold text-slate-800">{completedCount} of {totalCount} tasks</div></div></div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200"><h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><CheckCircle2 className="text-emerald-500" size={20} /> Combined Tasks</h3>
          {totalCount === 0 ? <p className="text-sm text-slate-500 italic py-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50">No activity logged.</p> : (
            <div className="space-y-3">{allDayTodos.map((t, i) => (<div key={i} className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${t.completed ? 'bg-emerald-50 border-emerald-200 opacity-70' : 'bg-white border-slate-200'}`}>{t.completed ? <CheckCircle2 className="text-emerald-500 shrink-0 mt-0.5" size={18} /> : <Circle className="text-slate-300 shrink-0 mt-0.5" size={18} />}<div><p className={`text-sm font-medium ${t.completed ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{t.text}</p><span className="text-[10px] px-2 py-0.5 mt-1 inline-block rounded-md font-medium border border-slate-200 bg-slate-100 text-slate-500">{t.subjectName || 'Personal'}</span></div></div>))}</div>)}
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200"><h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><BrainCircuit className="text-indigo-500" size={20} /> AI Study Log</h3>
          {dayPlanTopics.length === 0 ? <p className="text-sm text-slate-500 italic py-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">No AI topics.</p> : (
            <div className="space-y-3">{dayPlanTopics.map((t, idx) => (<div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200"><div className="flex justify-between items-start mb-2"><div><span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">{t.subjectName}</span><h4 className="font-semibold text-slate-800 text-sm mt-0.5">{t.topicName}</h4></div><DifficultyBadge level={t.difficulty} /></div><div className="text-xs text-slate-500 flex items-center gap-1"><Clock size={12} /> {t.allocatedHours} hours</div></div>))}</div>)}
        </div>
      </div>
    </div>
  );
};

const themeStyles = `
  .theme-dark { background-color: #0f172a !important; color: #f8fafc !important; }
  .theme-dark .bg-slate-50 { background-color: #0f172a !important; }
  .theme-dark .bg-white, .theme-dark .bg-white\\/50 { background-color: #1e293b !important; }
  .theme-dark .text-slate-900, .theme-dark .text-slate-800, .theme-dark .text-slate-700 { color: #f8fafc !important; }
  .theme-dark .border-slate-200 { border-color: #334155 !important; }
  .theme-cyber { background-color: #050505 !important; color: #00ff00 !important; font-family: monospace !important; }
  .theme-cyber .bg-white, .theme-cyber .bg-white\\/50 { background-color: #0a0a0a !important; border: 1px solid #00aa00 !important; }
  .theme-cyber .bg-indigo-600 { background-color: #00ff00 !important; color: #000 !important; }
  .theme-modern { background: linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%) !important; }
  .theme-modern .bg-white { background-color: rgba(255, 255, 255, 0.7) !important; backdrop-filter: blur(16px); }
  .theme-pastel { background-color: #fff5f8 !important; color: #6d5b7b !important; }
  .theme-pastel .bg-white { background-color: #ffffff !important; border-color: #f8bbd0 !important; }
  .theme-pastel .bg-indigo-600 { background-color: #f8bbd0 !important; color: #6d5b7b !important; }
  .theme-midnight { background-color: #020617 !important; color: #94a3b8 !important; }
  .theme-midnight .bg-white { background-color: #0f172a !important; border-color: #1e293b !important; }
  .theme-midnight .bg-indigo-600 { background-color: #38bdf8 !important; color: #020617 !important; }
  .theme-forest { background-color: #061d15 !important; color: #a3b18a !important; }
  .theme-forest .bg-white { background-color: #1a2f26 !important; border-color: #344e41 !important; }
  .theme-forest .bg-indigo-600 { background-color: #588157 !important; color: #061d15 !important; }
  .theme-sunset { background: linear-gradient(180deg, #2d1b33 0%, #1a1a1a 100%) !important; color: #ffb8b8 !important; }
  .theme-sunset .bg-white { background-color: rgba(60, 30, 70, 0.6) !important; border-color: #ff7e5f !important; }
  .theme-sunset .bg-indigo-600 { background: linear-gradient(90deg, #ff7e5f, #feb47b) !important; color: #2d1b33 !important; }
`;

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [theme, setTheme] = useState(() => localStorage.getItem('smartPlannerTheme') || 'light');
  
  const [user, setUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login'); 
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  const [plans, setPlans] = useState([]);
  const [todos, setTodos] = useState([]); 
  const [customTodos, setCustomTodos] = useState([]);
  const [dailySchedules, setDailySchedules] = useState({});
  const [notes, setNotes] = useState([]);
  const [aiTaskCompletions, setAiTaskCompletions] = useState({});

  const [subjectName, setSubjectName] = useState('');
  const [syllabus, setSyllabus] = useState('');
  const [fileData, setFileData] = useState(null);
  const [fileName, setFileName] = useState('');
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]);
  const [dailyHours, setDailyHours] = useState(4);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false);

  useEffect(() => { localStorage.setItem('smartPlannerTheme', theme); }, [theme]);

  useEffect(() => {
    if (!auth) { setAuthLoading(false); return; }
    
    const initAuth = async () => {
      try {
        // [Inference] We removed the custom token check because you are hardcoding your own Firebase project.
        // It will now just authenticate anonymously or wait for user login.
        if (!auth.currentUser) {
          await signInAnonymously(auth).catch((err) => console.warn("Guest mode login failed, manual login required.", err));
        }
      } catch (err) {
        console.error("Auth init error:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    if (!auth) { setAuthError("Firebase connection failed."); return; }
    
    setAuthLoading(true); setAuthError('');
    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      }
      setShowAuthModal(false);
    } catch (err) {
      if (err.code === 'auth/configuration-not-found') {
         setAuthError('Error: Please enable Email/Password authentication in your Firebase Console.');
      } else {
         setAuthError(err.message.replace('Firebase: ', ''));
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    if (auth) await signOut(auth);
  };

  useEffect(() => {
    if (!user || !db) {
       setPlans([]); setCustomTodos([]); setDailySchedules({}); setNotes([]); setAiTaskCompletions({});
       return; 
    }

    const plansRef = collection(db, 'artifacts', appId, 'users', user.uid, 'plans');
    const unsubPlans = onSnapshot(plansRef, (snap) => setPlans(snap.docs.map(d => d.data())), e => console.error(e));

    const todosRef = collection(db, 'artifacts', appId, 'users', user.uid, 'customTodos');
    const unsubTodos = onSnapshot(todosRef, (snap) => setCustomTodos(snap.docs.map(d => d.data())), e => console.error(e));

    const notesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'notes');
    const unsubNotes = onSnapshot(notesRef, (snap) => setNotes(snap.docs.map(d => d.data())), e => console.error(e));

    const completionsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'aiTaskCompletions');
    const unsubComps = onSnapshot(completionsRef, (snap) => {
      const comps = {};
      snap.docs.forEach(d => { comps[d.id] = d.data().completed; });
      setAiTaskCompletions(comps);
    }, e => console.error(e));

    const schedulesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'dailySchedules');
    const unsubScheds = onSnapshot(schedulesRef, (snap) => {
      const scheds = {};
      snap.docs.forEach(d => { scheds[d.id] = d.data().items || []; });
      setDailySchedules(scheds);
    }, e => console.error(e));

    return () => { unsubPlans(); unsubTodos(); unsubNotes(); unsubComps(); unsubScheds(); };
  }, [user]);

  useEffect(() => {
    const allAiTodos = plans.flatMap(plan => 
      plan.schedule.flatMap(day => 
        day.topics.map((t, idx) => {
          const id = `${plan.id}-${day.date}-${idx}`;
          return {
            id,
            subjectName: plan.subjectName,
            date: day.date,
            text: t.topicName,
            completed: aiTaskCompletions[id] || false,
            allocatedHours: t.allocatedHours,
            difficulty: t.difficulty
          };
        })
      )
    );
    setTodos(allAiTodos);
  }, [plans, aiTaskCompletions]);

  const handleGenerate = async () => {
    if (!subjectName.trim()) { setError('Please give this subject a name.'); return; }
    if (!syllabus.trim() && !fileData) { setError('Please provide syllabus content or upload a PDF.'); return; }
   
    setError(''); setIsGenerating(true);
    try {
      const newPlan = await generateStudyPlan(subjectName, syllabus, fileData, startDate, endDate, dailyHours);
      if (user && db) {
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'plans', newPlan.id), newPlan);
      }
      setSubjectName(''); setSyllabus(''); setFileData(null); setFileName('');
      setActiveTab('todo');
    } catch (err) { 
      console.error("AI Generation Error:", err);
      setError(`AI Error: ${err.message}`); 
    } finally { setIsGenerating(false); }
  };

  const deletePlan = async (id) => {
    if (user && db) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'plans', id));
  };

  const toggleTodo = async (id) => {
    const currentStatus = aiTaskCompletions[id] || false;
    if (user && db) await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'aiTaskCompletions', id), { completed: !currentStatus });
  };

  const addCustomTodo = async (t, p, d) => {
    const newId = Date.now().toString();
    const newTodo = { id: newId, text: t, completed: false, priority: p, dueDate: d };
    if (user && db) await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'customTodos', newId), newTodo);
  };

  const toggleCustomTodo = async (id) => {
    const todo = customTodos.find(t => t.id === id);
    if (todo && user && db) await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'customTodos', id), { ...todo, completed: !todo.completed });
  };

  const editCustomTodo = async (id, txt) => {
    const todo = customTodos.find(t => t.id === id);
    if (todo && user && db) await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'customTodos', id), { ...todo, text: txt });
  };

  const deleteCustomTodo = async (id) => {
    if (user && db) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'customTodos', id));
  };

  const addDailySchedule = async (dateStr, s, e, a) => {
    if (!user || !db) return;
    const newItem = { id: Date.now().toString(), startTime: s, endTime: e, activity: a };
    const existingItems = dailySchedules[dateStr] || [];
    const updatedItems = [...existingItems, newItem].sort((x, y) => x.startTime.localeCompare(y.startTime));
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'dailySchedules', dateStr), { items: updatedItems });
  };

  const deleteDailySchedule = async (dateStr, id) => {
    if (!user || !db) return;
    const existingItems = dailySchedules[dateStr] || [];
    const updatedItems = existingItems.filter(i => i.id !== id);
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'dailySchedules', dateStr), { items: updatedItems });
  };

  const syncNoteToCloud = async (noteObj) => {
    if (user && db) await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', noteObj.id), noteObj);
  };

  const handleNotesUpdate = (newNoteObjOrId, isUpdate = false, isDelete = false) => {
    if (isDelete) {
      if (user && db) deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', newNoteObjOrId.id));
    } else {
      syncNoteToCloud(newNoteObjOrId);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (file.type !== 'application/pdf') { setError('Currently, only PDF files are supported.'); return; }
    const MAX_FILE_SIZE_MB = 10;
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) { setError(`File is too large. Please upload a PDF under ${MAX_FILE_SIZE_MB}MB.`); return; }
    setError(''); setFileName(file.name);
    const reader = new FileReader(); reader.onloadend = () => { const base64String = reader.result.replace('data:', '').replace(/^.+,/, ''); setFileData({ mimeType: file.type, data: base64String }); };
    reader.readAsDataURL(file);
  };

  const clearFile = () => { setFileData(null); setFileName(''); };

  const availableThemes = ['light', 'dark', 'cyber', 'modern', 'pastel', 'midnight', 'forest', 'sunset'];
  const isAnonymous = user ? user.isAnonymous : true;

  return (
    <div className={`min-h-screen bg-slate-50 text-slate-800 font-sans theme-${theme}`}>
      <style>{themeStyles}</style>

      {/* --- Authentication Modal --- */}
      {showAuthModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl relative border border-slate-200">
            <button onClick={() => setShowAuthModal(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-800"><X size={20}/></button>
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4"><Cloud size={32} /></div>
              <h2 className="text-2xl font-bold text-slate-900">{authMode === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
              <p className="text-sm text-slate-500 mt-1">Save your study progress securely online.</p>
            </div>
            
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Email</label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} required className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500"/>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Password</label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} required minLength="6" className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500"/>
                </div>
              </div>
              {authError && <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-xs rounded-xl flex items-center gap-2"><AlertCircle size={24} className="shrink-0"/> {authError}</div>}
              <button type="submit" disabled={authLoading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
                {authLoading ? <Loader2 size={18} className="animate-spin" /> : authMode === 'login' ? 'Login' : 'Sign Up'}
              </button>
            </form>
            
            <div className="mt-6 text-center text-sm text-slate-600">
              {authMode === 'login' ? "Don't have an account? " : "Already have an account? "}
              <button onClick={() => {setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthError('');}} className="font-bold text-indigo-600 hover:underline">
                {authMode === 'login' ? 'Sign Up' : 'Login'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Main Navigation --- */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 px-4 md:px-8 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between py-3">
          <div onClick={() => setActiveTab('home')} className="flex items-center gap-2 cursor-pointer"><div className="bg-indigo-600 p-1.5 rounded-lg text-white"><BrainCircuit size={20} /></div><h1 className="font-bold text-slate-900 hidden sm:block">SmartPlanner</h1></div>
          <div className="flex items-center justify-end gap-1 sm:gap-2 flex-wrap">
            <button onClick={() => setActiveTab('planner')} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'planner' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}><LayoutDashboard size={18} />Planner</button>
            <button onClick={() => setActiveTab('calendar')} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'calendar' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}><CalendarDays size={18} />Calendar</button>
            <button onClick={() => setActiveTab('todo')} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'todo' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}><ListTodo size={18} />To-Do</button>
            <button onClick={() => setActiveTab('notes')} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'notes' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}><StickyNote size={18} />Notes</button>
            <button onClick={() => setActiveTab('history')} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'history' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}><BarChart3 size={18} />Analysis</button>
            
            <div className="h-6 w-px bg-slate-200 mx-1 sm:mx-2 shrink-0"></div>
            
            <div className="flex items-center gap-1 sm:gap-2 shrink-0 relative"><Palette size={16} className="text-slate-400 hidden lg:block" /><button onClick={() => setIsThemeDropdownOpen(!isThemeDropdownOpen)} className="flex items-center gap-1 p-1 sm:px-3 sm:py-2 rounded-xl border border-slate-200 text-xs font-medium bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors pointer-cursor"><span className="capitalize">{theme}</span><ChevronDown size={14} /></button>
              {isThemeDropdownOpen && (<><div className="fixed inset-0 z-40" onClick={() => setIsThemeDropdownOpen(false)}></div><div className="absolute right-0 top-full mt-2 w-32 bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden z-50 py-1">{availableThemes.map((t) => (<button key={t} onClick={() => { setTheme(t); setIsThemeDropdownOpen(false); }} className={`w-full text-left px-4 py-2 text-sm transition-colors capitalize ${theme === t ? 'text-indigo-600 font-bold bg-indigo-50' : 'text-slate-700 hover:bg-slate-50'}`}>{t}</button>))}</div></>)}
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {authLoading ? (
              <><Loader2 size={18} className="animate-spin text-slate-400" /><span className="text-sm font-bold text-slate-500">Checking sync status...</span></>
            ) : isAnonymous ? (
              <><CloudOff size={20} className="text-amber-500" /><span className="text-sm font-bold text-slate-700">Guest Mode <span className="font-normal text-slate-500">(Data not synced)</span></span></>
            ) : (
              <><Cloud size={20} className="text-emerald-500" /><span className="text-sm font-bold text-slate-700">Cloud Sync Active <span className="font-normal text-slate-500">({user?.email})</span></span></>
            )}
          </div>
          <div>
            {!authLoading && (
              isAnonymous ? (
                <button onClick={() => setShowAuthModal(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-sm hover:opacity-90 transition-opacity">
                  <LogIn size={16} /> Login to Sync
                </button>
              ) : (
                <button onClick={handleLogout} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-colors">
                  <LogOut size={16} /> Logout
                </button>
              )
            )}
          </div>
        </div>

        {activeTab === 'home' && <HomeView setActiveTab={setActiveTab} setTheme={setTheme} currentTheme={theme} />}
        {activeTab === 'planner' && (
          <div className="animate-in fade-in duration-300">
            <header className="flex items-center gap-3 pb-4 border-b border-slate-200 mb-6"><div className="bg-indigo-600 p-2.5 rounded-xl text-white"><BrainCircuit size={28} /></div><div><h1 className="text-2xl md:text-3xl font-bold text-slate-900">Multi-Subject Planner</h1><p className="text-slate-500 text-sm">Add different subjects to generate a global schedule.</p></div></header>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 space-y-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><BookOpen size={20} className="text-indigo-500" />Add New Syllabus</h2>
                  <div className="space-y-4">
                    <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Subject Name</label><input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="e.g. Physics Final" className="w-full p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"/></div>
                    <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Upload PDF</label>{!fileData ? (<label className="flex flex-col items-center justify-center w-full h-24 border-2 border-slate-300 border-dashed rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors"><UploadCloud className="w-6 h-6 mb-1 text-slate-400" /><p className="text-xs text-slate-400">Click to upload</p><input type="file" className="hidden" accept="application/pdf" onChange={handleFileUpload}/></label>) : (<div className="flex items-center justify-between p-2 bg-indigo-50 border border-indigo-100 rounded-xl"><div className="flex items-center gap-3 overflow-hidden"><FileText className="text-indigo-500 shrink-0" size={20} /><span className="text-xs font-medium truncate">{fileName}</span></div><button onClick={clearFile} className="p-1 text-indigo-400 hover:text-indigo-600"><X size={16} /></button></div>)}</div>
                    <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Paste Content</label><textarea value={syllabus} onChange={(e) => setSyllabus(e.target.value)} placeholder="Or paste text here..." className="w-full h-24 p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-xs"/></div>
                    <div className="grid grid-cols-2 gap-4"><div><label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Start</label><CustomDatePicker value={startDate} onChange={setStartDate} minDate={new Date().toISOString().split('T')[0]} /></div><div><label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">End</label><CustomDatePicker value={endDate} onChange={setEndDate} minDate={startDate} /></div></div>
                    <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Daily Study Hours</label><input type="number" min="1" max="24" value={dailyHours} onChange={(e) => setDailyHours(e.target.value)} onBlur={(e) => { let v = parseInt(e.target.value); setDailyHours(isNaN(v) || v < 1 ? 1 : v > 24 ? 24 : v); }} className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
                    {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs flex items-start gap-2"><AlertCircle size={18} className="shrink-0" /><span className="font-medium">{error}</span></div>}
                    <button onClick={handleGenerate} disabled={isGenerating} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl font-bold flex justify-center items-center gap-2">{isGenerating ? <><Loader2 size={18} className="animate-spin" />Analyzing...</> : <>Generate Plan</>}</button>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><Tag className="text-indigo-500" /> Active Subjects</h2>
                  {plans.length === 0 ? <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400">No active plans.</div> : (
                    <div className="grid gap-4">{plans.map(p => (
                      <div key={p.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl group relative shadow-sm">
                        <div className="flex justify-between items-start mb-2"><h3 className="text-lg font-extrabold text-indigo-700 uppercase tracking-tighter">{p.subjectName}</h3><button onClick={() => deletePlan(p.id)} className="p-1 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={18} /></button></div>
                        <div className="flex gap-4 text-xs font-bold text-slate-500 uppercase tracking-widest mb-4"><span>{p.schedule.length} Days</span><span>{p.schedule[0].date} to {p.schedule[p.schedule.length - 1].date}</span></div>
                        <div className="space-y-2">{p.schedule.slice(0, 2).map((day, dIdx) => (
                          <div key={dIdx} className="bg-white p-3 rounded-xl border border-slate-200 flex justify-between items-center"><div className="text-xs font-bold text-slate-800">{day.date}</div><div className="text-[10px] text-slate-400">{day.topics.length} topics</div></div>
                        ))}</div>
                        {p.schedule.length > 2 && <p className="text-[10px] text-center text-slate-400 mt-2 font-bold uppercase tracking-widest">... more in tabs ...</p>}
                      </div>
                    ))}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'calendar' && <div className="animate-in fade-in duration-300"><CalendarView plans={plans} dailySchedules={dailySchedules} addDailySchedule={addDailySchedule} deleteDailySchedule={deleteDailySchedule} /></div>}
        {activeTab === 'todo' && <div className="animate-in fade-in duration-300"><TodoView todos={todos} toggleTodo={toggleTodo} customTodos={customTodos} addCustomTodo={addCustomTodo} toggleCustomTodo={toggleCustomTodo} deleteCustomTodo={deleteCustomTodo} editCustomTodo={editCustomTodo} /></div>}
        {activeTab === 'notes' && <div className="animate-in fade-in duration-300"><NotesView notes={notes} setNotes={handleNotesUpdate} /></div>}
        {activeTab === 'history' && <div className="animate-in fade-in duration-300"><HistoryView plans={plans} customTodos={customTodos} todos={todos} dailySchedules={dailySchedules} /></div>}
      </div>
    </div>
  );
}