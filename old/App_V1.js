import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, Search, ShoppingCart, Trash2, Download, 
  Database, Sparkles, X, Plus, FileText, Filter, 
  Package, ChevronDown, ChevronRight, MessageSquare,
  FileCode, ClipboardCheck, AlertCircle, Info, CheckCircle2,
  ArrowRight, ChevronsDown, ChevronsUp, Maximize2
} from 'lucide-react';

// --- API Configuration ---
const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
const GEN_MODEL = "gemini-2.5-flash-preview-09-2025";

const fetchGemini = async (prompt, systemInstruction = "") => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEN_MODEL}:generateContent?key=${apiKey}`;
  
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined
  };

  const maxRetries = 5;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('API request failed');
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text;
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise(res => setTimeout(res, Math.pow(2, i) * 1000));
    }
  }
};

const App = () => {
  const [cohorts, setCohorts] = useState([]);
  const [variables, setVariables] = useState([]);
  const [cart, setCart] = useState([]);
  const [activeTab, setActiveTab] = useState('upload');
  
  // AI Discovery State
  const [searchQuery, setSearchQuery] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const chatEndRef = useRef(null);

  // Browse/Filter State
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedCohort, setSelectedCohort] = useState(null);
  const [filterTable, setFilterTable] = useState('');
  const [filterCompleteness, setFilterCompleteness] = useState(0);
  const [expandedCohorts, setExpandedCohorts] = useState({});
  const [expandedTables, setExpandedTables] = useState({});
  const [expandedVariable, setExpandedVariable] = useState(null);

  // Cart Specific UI State
  const [expandedCartCohorts, setExpandedCartCohorts] = useState({});
  const [expandedCartTables, setExpandedCartTables] = useState({});

  // Harmonisation State
  const [isHarmonising, setIsLoadingHarmonising] = useState(false);
  const [harmonisationGroups, setHarmonisationGroups] = useState([]);
  const [showHarmonisation, setShowHarmonisation] = useState(false);

  // Similar Variables Modal State
  const [similarModal, setSimilarModal] = useState({
    isOpen: false,
    sourceVar: null,
    results: [],
    isLoading: false,
    error: null
  });

  // Scrolling for chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const parseCSV = (text, fileName) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const parseLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) {
          result.push(current.trim().replace(/^"|"$/g, ''));
          current = '';
        } else current += char;
      }
      result.push(current.trim().replace(/^"|"$/g, ''));
      return result;
    };

    const headers = parseLine(lines[0]).map(h => h.toLowerCase());
    const getIdx = (name) => headers.findIndex(h => h.includes(name));

    // Updated column mapping: var_name, var_label, filename, data_type
    const vNameIdx = getIdx('var_name') !== -1 ? getIdx('var_name') : getIdx('variable_name');
    const vDescIdx = getIdx('var_label') !== -1 ? getIdx('var_label') : (getIdx('variable_description') !== -1 ? getIdx('variable_description') : getIdx('description'));
    const valuesIdx = getIdx('values');
    const compIdx = getIdx('completeness');
    const tableIdx = getIdx('filename') !== -1 ? getIdx('filename') : (getIdx('table_name') !== -1 ? getIdx('table_name') : getIdx('table'));
    const typeIdx = getIdx('data_type') !== -1 ? getIdx('data_type') : (getIdx('datatype') !== -1 ? getIdx('datatype') : getIdx('type'));

    if (vNameIdx === -1 || tableIdx === -1) {
      return null;
    }

    return lines.slice(1).map(line => {
      const values = parseLine(line);
      return {
        variable_name: values[vNameIdx] || 'Unnamed',
        variable_description: values[vDescIdx] || 'No description',
        values: values[valuesIdx] || 'N/A',
        completeness: parseFloat(values[compIdx]) || 0,
        table_name: values[tableIdx] || 'Default',
        datatype: typeIdx !== -1 ? values[typeIdx] : 'String',
        cohort_name: fileName.replace('.csv', '')
      };
    });
  };

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    let newAllVars = [...variables];
    let newAllCohorts = [...cohorts];

    for (const file of files) {
      const text = await file.text();
      const parsed = parseCSV(text, file.name);
      
      if (!parsed) {
        alert(`File ${file.name} is missing required columns (var_name, filename).`);
        continue;
      }

      newAllVars = [...newAllVars, ...parsed];
      newAllCohorts.push({
        name: file.name.replace('.csv', ''),
        variableCount: parsed.length,
        tables: [...new Set(parsed.map(v => v.table_name))],
        uploadDate: new Date().toLocaleDateString()
      });
    }

    setVariables(newAllVars);
    setCohorts(newAllCohorts);
    e.target.value = '';
  };

  const getAISuggestions = async () => {
    if (!searchQuery.trim() || variables.length === 0) return;
    
    const userMsg = { role: 'user', content: searchQuery };
    setChatMessages(prev => [...prev, userMsg]);
    setSearchQuery('');
    setIsLoadingAI(true);

    const systemPrompt = `You are a research assistant for cohort data exploration. 
Available variables:
${variables.map(v => `- ${v.variable_name} (${v.cohort_name}): ${v.variable_description} [Table: ${v.table_name}]`).join('\n')}

Task:
1. Answer the user's research question concisely.
2. Provide a list of recommended variables from the dataset in a JSON block at the end.

CRITICAL INSTRUCTION: 
- Only suggest variables that are DIRECTLY relevant to the user's query. 
- You MUST return the "cohort_name" EXACTLY as it appears in the list above. For example, do not shorten "EXCEED_Metadata_ODV2" to "EXCEED". Copy the string exactly.
- If the variables are only vaguely related or not useful for the specific question, DO NOT include them.
- If no variables match, return an empty array []. 
- Assign a relevance score (1-10) to each suggestion. 

JSON Format:
SUGGESTIONS:
[
  { "variable_name": "exact_name", "cohort_name": "exact_cohort", "reason": "why relevant", "score": 1-10 }
]`;

    try {
      const responseText = await fetchGemini(searchQuery, systemPrompt);
      const parts = responseText.split('SUGGESTIONS:');
      const conversational = parts[0].trim();
      let suggestions = [];

      if (parts[1]) {
        try {
          const jsonStr = parts[1].trim().replace(/```json|```/g, '');
          const rawSuggestions = JSON.parse(jsonStr);
          
          // Strict filtering: Only allow high confidence matches (Score >= 7)
          if (Array.isArray(rawSuggestions)) {
            suggestions = rawSuggestions.filter(s => s.score >= 7);
          }
        } catch (e) { console.error("JSON parse error", e); }
      }

      setChatMessages(prev => [...prev, { role: 'assistant', content: conversational, suggestions }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: "I'm sorry, I had trouble processing that request." }]);
    } finally {
      setIsLoadingAI(false);
    }
  };

  const findSimilarVariables = async (sourceVar) => {
    setSimilarModal({ isOpen: true, sourceVar, results: [], isLoading: true, error: null });

    // Filter variables from OTHER cohorts
    const candidates = variables
      .filter(v => v.cohort_name !== sourceVar.cohort_name)
      .map(v => `${v.variable_name} | ${v.cohort_name} | ${v.variable_description}`);

    if (candidates.length === 0) {
      setSimilarModal(prev => ({ ...prev, isLoading: false, error: "No other cohorts available to search." }));
      return;
    }

    // Limit candidates to prevent token limit issues (simple slice for this demo)
    const candidatesStr = candidates.slice(0, 300).join('\n');

    const prompt = `Target Variable: "${sourceVar.variable_name}" (${sourceVar.variable_description}) from cohort "${sourceVar.cohort_name}".

Task: Find variables from the candidate list below that represent the SAME or VERY SIMILAR clinical concept. 
Be strict. If a variable is loosely related (e.g. same organ but different metric), give it a low score (< 50).
Only assign high scores (> 70) to variables that could effectively be used as substitutes in a meta-analysis.

Candidates (Format: Name | Cohort | Desc):
${candidatesStr}

Return ONLY a JSON array of objects with these exact keys: "variable_name", "cohort_name", "reason", "similarity_score" (0-100).`;

    try {
      const responseText = await fetchGemini(prompt, "You are a research data ontology expert. Be extremely critical with similarity scores. Output valid JSON only.");
      const jsonStr = responseText.replace(/```json|```/g, '').trim();
      const results = JSON.parse(jsonStr);
      
      const MIN_CONFIDENCE_THRESHOLD = 70;

      // Match back to full variable objects and filter strictly
      const enrichedResults = results.map(r => {
        const original = variables.find(v => v.variable_name === r.variable_name && v.cohort_name === r.cohort_name);
        return original ? { ...original, ...r } : null;
      })
      .filter(Boolean)
      .filter(item => item.similarity_score >= MIN_CONFIDENCE_THRESHOLD);

      setSimilarModal(prev => ({ ...prev, results: enrichedResults, isLoading: false }));
    } catch (err) {
      console.error(err);
      setSimilarModal(prev => ({ ...prev, isLoading: false, error: "Failed to find similar variables." }));
    }
  };

  const harmoniseVariables = async () => {
    if (cart.length < 2) return;
    setIsLoadingHarmonising(true);
    setShowHarmonisation(true);

    const prompt = `Harmonise these selected research variables across different cohorts. Identify variables representing the same concept and provide a mapping.

CRITICAL RULE: Only group variables from DIFFERENT cohorts. Do not group variables from the same cohort together in a single harmonisation group. Each group must represent a cross-cohort mapping.
    
Variables:
${cart.map(v => `- ${v.variable_name} (${v.cohort_name}): ${v.variable_description}. Values: ${v.values}`).join('\n')}

Return ONLY a JSON array of groups where EACH group contains 2 or more variables:
[
  {
    "harmonised_name": "Standard Name",
    "description": "Concept description",
    "reasoning": "Why these match",
    "standardized_values": "Proposed scale/units",
    "variables": [
      { "original_name": "name", "cohort": "cohort", "mapping": "how to transform" }
    ]
  }
]`;

    try {
      const responseText = await fetchGemini(prompt, "You are a data harmonisation expert. Output valid JSON only.");
      const jsonStr = responseText.trim().replace(/```json|```/g, '');
      const groups = JSON.parse(jsonStr);
      
      // Filter groups to ensure we only show concepts that involve 2 or more variables
      // AND ensure they span at least 2 different cohorts to prevent intra-cohort grouping
      const validGroups = Array.isArray(groups) 
        ? groups.filter(g => {
            if (!g.variables || g.variables.length < 2) return false;
            const uniqueCohorts = new Set(g.variables.map(v => v.cohort));
            return uniqueCohorts.size >= 2;
        }) 
        : [];
        
      setHarmonisationGroups(validGroups);
    } catch (err) {
      console.error(err);
      alert("Harmonisation failed. Try again.");
    } finally {
      setIsLoadingHarmonising(false);
    }
  };

  const addToCart = (v) => {
    if (!cart.some(item => item.variable_name === v.variable_name && item.cohort_name === v.cohort_name && item.table_name === v.table_name)) {
      setCart([...cart, v]);
    }
  };

  const removeFromCart = (v) => {
    setCart(cart.filter(item => !(item.variable_name === v.variable_name && item.cohort_name === v.cohort_name && item.table_name === v.table_name)));
  };

  const addTableToCart = (tableVariables) => {
    const toAdd = tableVariables.filter(v => !cart.some(item => item.variable_name === v.variable_name && item.cohort_name === v.cohort_name && item.table_name === v.table_name));
    setCart([...cart, ...toAdd]);
  };

  const removeTableFromCart = (tableVariables) => {
    setCart(cart.filter(item => !tableVariables.some(v => v.variable_name === item.variable_name && v.cohort_name === item.cohort_name && v.table_name === item.table_name)));
  };

  const handleCollapseAll = () => {
    const newExpanded = {};
    variables.forEach(v => {
      newExpanded[`${v.cohort_name}-${v.table_name}`] = false;
    });
    setExpandedTables(newExpanded);
  };

  const exportCSV = () => {
    const headers = "variable_name,variable_description,values,completeness,table_name,cohort_name\n";
    const rows = cart.map(v => `"${v.variable_name}","${v.variable_description}","${v.values}",${v.completeness},"${v.table_name}","${v.cohort_name}"`).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'selected_variables.csv';
    a.click();
  };

  const filteredVariables = variables.filter(v => {
    if (selectedCohort && v.cohort_name !== selectedCohort) return false;
    if (filterTable && v.table_name !== filterTable) return false;
    if (v.completeness < filterCompleteness) return false;
    if (searchFilter && !v.variable_name.toLowerCase().includes(searchFilter.toLowerCase()) && 
        !v.variable_description.toLowerCase().includes(searchFilter.toLowerCase())) return false;
    return true;
  });

  // Helper to determine if a variable is categorical
  const checkIsCategorical = (v) => {
    if (!v.datatype) return false;
    const type = v.datatype.toLowerCase();
    
    // Explicitly categorical
    if (['categorical', 'nominal', 'ordinal'].some(t => type.includes(t))) return true;
    
    // Check if it's NOT numeric and has commas in values
    if (['integer', 'float', 'number', 'numeric'].some(t => type.includes(t))) return false;
    
    if (v.values && v.values.includes(',')) return true;
    
    return false;
  };

  // Helper to sort values naturally (handles numbers and text)
  const getSortedValues = (valuesStr) => {
    if (!valuesStr) return [];
    return valuesStr.split(',')
      .map(v => v.trim())
      .filter(v => v)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  };

  const uniqueCohorts = [...new Set(variables.map(v => v.cohort_name))];

  // Helper to group cart items
  const cartCohorts = [...new Set(cart.map(v => v.cohort_name))];

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden relative">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0 border-r border-slate-800">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600 rounded-lg">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-base tracking-tight">CohortExplorer</h1>
              <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">DPUK Data Portal</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          <NavItem icon={<Upload />} label="Upload" active={activeTab === 'upload'} onClick={() => setActiveTab('upload')} />
          <NavItem icon={<Search />} label="Browse Data" active={activeTab === 'explore'} onClick={() => setActiveTab('explore')} disabled={variables.length === 0} />
          <NavItem icon={<Sparkles />} label="AI Discovery" active={activeTab === 'ai'} onClick={() => setActiveTab('ai')} disabled={variables.length === 0} />
          <NavItem 
            icon={<ShoppingCart />} 
            label="Research Cart" 
            active={activeTab === 'cart'} 
            onClick={() => setActiveTab('cart')} 
            badge={cart.length > 0 ? cart.length : null}
          />
        </nav>

        {/* Updated Sidebar Footer with Counts */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 font-bold uppercase tracking-widest">Total Cohorts</span>
            <span className="text-purple-400 font-black">{cohorts.length}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 font-bold uppercase tracking-widest">Total Variables</span>
            <span className="text-purple-400 font-black">{variables.length}</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <h2 className="text-base font-bold text-slate-700 capitalize">
            {activeTab === 'ai' ? 'AI Variable Discovery' : activeTab.replace('-', ' ')}
          </h2>
          <div className="flex items-center gap-4">
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-5xl mx-auto">
            
            {/* UPLOAD TAB */}
            {activeTab === 'upload' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-16 text-center hover:border-purple-400 transition-all group">
                  <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                    <Upload className="w-8 h-8 text-purple-500" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Populate Dataset Inventory</h3>
                  <p className="text-slate-500 text-sm max-w-sm mx-auto mb-8">
                    Upload CSV metadata files including variable_name, variable_description, values, completeness, and table_name
                  </p>
                  <div className="flex items-center justify-center gap-4">
                    <label className="px-8 py-3 bg-purple-600 text-white rounded-xl font-bold text-sm cursor-pointer hover:bg-purple-700 transition-all shadow-lg shadow-purple-200">
                      Choose Metadata Files
                      <input type="file" accept=".csv" multiple className="hidden" onChange={handleFileUpload} />
                    </label>
                  </div>
                </div>

                {cohorts.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {cohorts.map((c, i) => (
                      <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600 shrink-0">
                          <Package className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-bold text-sm text-slate-800">{c.name}</h4>
                          <p className="text-xs font-medium text-slate-400 mt-0.5">{c.variableCount} variables • {c.tables.length} tables</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* EXPLORE TAB */}
            {activeTab === 'explore' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                {/* Filters */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-xs font-bold text-slate-400 mb-1.5 block uppercase tracking-wider">Search Metadata</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="Keyword or variable code..."
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-purple-500 transition-all"
                        value={searchFilter}
                        onChange={e => setSearchFilter(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="w-48">
                    <label className="text-xs font-bold text-slate-400 mb-1.5 block uppercase tracking-wider">Cohort</label>
                    <select 
                      className="w-full px-3 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                      onChange={e => setSelectedCohort(e.target.value || null)}
                    >
                      <option value="">All Cohorts</option>
                      {uniqueCohorts.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="w-48">
                    <label className="text-xs font-bold text-slate-400 mb-1.5 block uppercase tracking-wider">Completeness ({filterCompleteness}%)</label>
                    <input 
                      type="range" min="0" max="100" value={filterCompleteness} 
                      onChange={e => setFilterCompleteness(parseInt(e.target.value))}
                      className="w-full h-2 bg-slate-100 rounded-lg appearance-none accent-purple-600"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 px-2">
                   <button 
                     onClick={() => setExpandedTables({})}
                     className="text-xs font-bold text-slate-400 hover:text-purple-600 flex items-center gap-1.5 transition-colors"
                   >
                     <ChevronsDown className="w-3.5 h-3.5" /> Expand All
                   </button>
                   <button 
                     onClick={handleCollapseAll}
                     className="text-xs font-bold text-slate-400 hover:text-purple-600 flex items-center gap-1.5 transition-colors"
                   >
                     <ChevronsUp className="w-3.5 h-3.5" /> Collapse All
                   </button>
                </div>

                {/* Variable List */}
                <div className="space-y-4">
                  {uniqueCohorts.filter(cn => !selectedCohort || cn === selectedCohort).map(cohortName => {
                    const cohortVars = filteredVariables.filter(v => v.cohort_name === cohortName);
                    if (cohortVars.length === 0) return null;
                    const tablesInCohort = [...new Set(cohortVars.map(v => v.table_name))];

                    return (
                      <div key={cohortName} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <Package className="w-5 h-5 text-purple-600" />
                            {cohortName}
                          </h3>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {tablesInCohort.map(tableName => {
                            const tableVars = cohortVars.filter(v => v.table_name === tableName);
                            const tableKey = `${cohortName}-${tableName}`;
                            const isExpanded = expandedTables[tableKey] !== false;
                            
                            // Check if all variables of this table are in cart
                            const allInCart = tableVars.every(v => cart.some(item => item.variable_name === v.variable_name && item.cohort_name === v.cohort_name && item.table_name === v.table_name));
                            const someInCart = tableVars.some(v => cart.some(item => item.variable_name === v.variable_name && item.cohort_name === v.cohort_name && item.table_name === v.table_name));

                            return (
                              <div key={tableName}>
                                <div 
                                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-100"
                                  onClick={() => setExpandedTables({...expandedTables, [tableKey]: !isExpanded})}
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="text-slate-400">
                                      {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                                    </span>
                                    <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wide">{tableName}</h4>
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-xs font-bold">{tableVars.length}</span>
                                  </div>
                                  
                                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                    {allInCart ? (
                                      <button 
                                        onClick={() => removeTableFromCart(tableVars)}
                                        className="px-3 py-1 bg-slate-100 text-slate-500 rounded-lg text-xs font-bold hover:bg-red-100 hover:text-red-600 transition-colors flex items-center gap-1.5"
                                      >
                                        <Trash2 className="w-3 h-3" /> Remove Table
                                      </button>
                                    ) : (
                                      <button 
                                        onClick={() => addTableToCart(tableVars)}
                                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${someInCart ? 'bg-purple-50 text-purple-600 border border-purple-200' : 'bg-purple-600 text-white hover:bg-purple-700 shadow-sm shadow-purple-100'}`}
                                      >
                                        <Plus className="w-3 h-3" /> {someInCart ? 'Add Remaining' : 'Select All'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {isExpanded && (
                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 bg-slate-50/50">
                                    {tableVars.map(v => {
                                      const inCart = cart.some(item => item.variable_name === v.variable_name && item.cohort_name === v.cohort_name && item.table_name === v.table_name);
                                      const isCat = checkIsCategorical(v);
                                      
                                      return (
                                        <div 
                                          key={v.variable_name} 
                                          onClick={() => setExpandedVariable(v)}
                                          className={`group relative p-4 rounded-xl border shadow-sm transition-all flex flex-col justify-between h-full cursor-pointer ${
                                            inCart 
                                              ? 'bg-purple-50 border-purple-200 ring-1 ring-purple-200' 
                                              : 'bg-white border-slate-200 hover:border-purple-300 hover:shadow-md'
                                          }`}
                                        >
                                          {/* Top Section */}
                                          <div className="mb-2">
                                              <div className="flex items-start justify-between gap-3 mb-1.5">
                                                  <h5 className="font-bold text-slate-800 text-base break-all leading-snug" title={v.variable_name}>
                                                      {v.variable_name}
                                                  </h5>
                                                  <div className="flex items-center gap-2 shrink-0">
                                                    <Maximize2 className="w-3.5 h-3.5 text-slate-300 group-hover:text-purple-400 transition-colors" />
                                                    <span className={`text-xs px-2 py-0.5 rounded font-bold uppercase tracking-wider shrink-0 self-start ${['Integer', 'Float', 'Number'].some(t => v.datatype?.includes(t)) ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                                                        {v.datatype}
                                                    </span>
                                                  </div>
                                              </div>
                                              
                                              <p className="text-sm text-slate-600 leading-relaxed font-medium line-clamp-2 min-h-[2.5em] mb-2" title={v.variable_description}>
                                                  {v.variable_description}
                                              </p>

                                              {/* Metrics Row */}
                                              <div className="flex items-center gap-3 py-1.5 border-t border-dashed border-slate-100">
                                                   <div className="flex items-center gap-2" title={`Completeness: ${v.completeness}%`}>
                                                        <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                                          <div className={`h-full rounded-full ${v.completeness > 80 ? 'bg-emerald-500' : v.completeness > 50 ? 'bg-amber-400' : 'bg-red-400'}`} style={{width: `${v.completeness}%`}}></div>
                                                        </div>
                                                        <span className="text-xs font-bold text-slate-500">{v.completeness}%</span>
                                                   </div>
                                                   <div className="h-3 w-px bg-slate-200"></div>
                                                   <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden">
                                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0">Vals:</span>
                                                        {isCat ? (
                                                          <div className="flex gap-1 overflow-hidden mask-linear-fade">
                                                            {getSortedValues(v.values).map((val, i) => (
                                                              <span key={i} className="text-xs bg-slate-100 text-slate-600 px-1.5 rounded-md border border-slate-200 whitespace-nowrap">{val}</span>
                                                            ))}
                                                          </div>
                                                        ) : (
                                                          <span className="text-xs text-slate-700 font-bold truncate" title={v.values}>{v.values}</span>
                                                        )}
                                                   </div>
                                              </div>
                                          </div>

                                          {/* Actions Footer */}
                                          <div className="flex items-center gap-2 mt-auto pt-2">
                                              <button 
                                                 onClick={(e) => { e.stopPropagation(); findSimilarVariables(v); }}
                                                 className="px-3 py-2 rounded-lg text-xs font-bold text-slate-500 hover:text-purple-600 hover:bg-purple-50 transition-colors flex items-center gap-1.5 border border-transparent hover:border-purple-100"
                                               >
                                                 <Sparkles className="w-4 h-4" /> Similar
                                               </button>

                                               <button 
                                                  onClick={(e) => { e.stopPropagation(); inCart ? removeFromCart(v) : addToCart(v); }}
                                                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm ${
                                                    inCart 
                                                      ? 'bg-red-50 text-red-600 border border-red-100 hover:bg-red-100' 
                                                      : 'bg-slate-900 text-white border border-slate-900 hover:bg-slate-800'
                                                  }`}
                                                >
                                                  {inCart ? (
                                                    <>
                                                      <Trash2 className="w-4 h-4" /> Remove
                                                    </>
                                                  ) : (
                                                    <>
                                                      <Plus className="w-4 h-4" /> Add to Cart
                                                    </>
                                                  )}
                                                </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* AI DISCOVERY TAB */}
            {activeTab === 'ai' && (
              <div className="flex flex-col h-[75vh] space-y-4 animate-in slide-in-from-bottom-4 duration-500">
                <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                  <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-600" />
                      <span className="text-sm font-bold text-slate-600 uppercase tracking-widest">Discovery Assistant</span>
                    </div>
                    <div className="flex items-center gap-1">
                       <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                       <span className="text-xs font-bold text-slate-400 uppercase">Live Index</span>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {chatMessages.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                        <MessageSquare className="w-16 h-16 mb-4 text-slate-400" />
                        <h4 className="font-bold text-slate-700">AI Powered Variable Discovery</h4>
                        <p className="text-sm max-w-xs mt-1">Describe your research topic (e.g., "cognitive decline markers in early onset dementia") and I'll identify relevant variables across all cohorts.</p>
                      </div>
                    )}
                    
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                        <div className={`max-w-[85%] rounded-2xl p-4 text-sm shadow-sm ${msg.role === 'user' ? 'bg-purple-600 text-white rounded-tr-none' : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200'}`}>
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                          
                          {msg.suggestions && msg.suggestions.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Automated Matches:</p>
                              {msg.suggestions.map((s, si) => {
                                const fullVar = variables.find(v => v.variable_name === s.variable_name && v.cohort_name === s.cohort_name);
                                const inCart = fullVar && cart.some(item => item.variable_name === fullVar.variable_name && item.cohort_name === fullVar.cohort_name && item.table_name === fullVar.table_name);
                                
                                return (
                                  <div key={si} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between group/suggest transition-all hover:border-purple-300">
                                    <div className="min-w-0 pr-4">
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-sm text-slate-800 truncate">{s.variable_name}</span>
                                        <span className="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full uppercase font-bold">{s.cohort_name}</span>
                                      </div>
                                      <p className="text-xs text-slate-400 italic truncate mt-0.5">{s.reason}</p>
                                    </div>
                                    <button 
                                      disabled={!fullVar || inCart}
                                      onClick={() => fullVar && addToCart(fullVar)}
                                      className={`p-2 rounded-lg transition-all ${inCart ? 'text-emerald-600 bg-emerald-50' : 'text-purple-600 bg-purple-50 hover:bg-purple-600 hover:text-white'}`}
                                    >
                                      {inCart ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {isLoadingAI && (
                      <div className="flex justify-start">
                        <div className="bg-slate-100 p-4 rounded-2xl rounded-tl-none border border-slate-200 flex items-center gap-2">
                          <div className="flex gap-1">
                            <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce"></div>
                            <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce delay-100"></div>
                            <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce delay-200"></div>
                          </div>
                          <span className="text-xs font-bold text-purple-400 uppercase ml-2 tracking-widest">Processing</span>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <div className="p-4 border-t border-slate-200 bg-slate-50">
                    <div className="flex gap-2 relative">
                      <input 
                        type="text" 
                        placeholder="Search concepts across metadata..."
                        className="flex-1 px-5 py-3 bg-white border border-slate-200 rounded-2xl text-sm shadow-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all pr-12"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyPress={e => e.key === 'Enter' && getAISuggestions()}
                      />
                      <button 
                        onClick={getAISuggestions}
                        className="absolute right-2 top-2 p-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-all shadow-md active:scale-95"
                      >
                        <Search className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* CART TAB */}
            {activeTab === 'cart' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {cart.length === 0 ? (
                  <div className="text-center py-24 bg-white border border-slate-200 rounded-2xl opacity-40 shadow-sm">
                    <ShoppingCart className="w-16 h-16 mx-auto mb-4 text-slate-200" />
                    <h3 className="font-bold text-lg text-slate-700">No Variables Selected</h3>
                    <p className="text-sm max-w-xs mx-auto mt-1">Browse the cohorts or use the AI discovery to start building your dataset dictionary.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between px-2">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold text-slate-800">Research Inventory</h3>
                        <span className="px-2.5 py-0.5 bg-purple-600 text-white rounded-full text-xs font-black uppercase">{cart.length}</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setCart([])} className="px-4 py-2 border border-slate-200 text-slate-500 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all">
                          <Trash2 className="w-3.5 h-3.5" /> Clear Cart
                        </button>
                        <button onClick={exportCSV} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-slate-800 transition-all shadow-sm">
                          <Download className="w-3.5 h-3.5" /> Export Selection
                        </button>
                        <button 
                          onClick={harmoniseVariables}
                          disabled={isHarmonising}
                          className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-purple-700 shadow-xl shadow-purple-100 transition-all"
                        >
                          {isHarmonising ? (
                            <>
                               <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                               Mapping...
                            </>
                          ) : (
                            <><Sparkles className="w-3.5 h-3.5" /> Run AI Harmonisation</>
                          )}
                        </button>
                      </div>
                    </div>

                    {showHarmonisation && (
                      <div className="bg-slate-900 rounded-2xl p-8 text-white shadow-2xl animate-in zoom-in-95 duration-500 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 blur-[100px] rounded-full -mr-32 -mt-32"></div>
                        <div className="relative z-10">
                          <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                              <div className="p-3 bg-purple-600/20 border border-purple-500/30 rounded-2xl">
                                <Sparkles className="w-6 h-6 text-purple-400" />
                              </div>
                              <div>
                                 <h4 className="font-bold text-xl tracking-tight">Cross-Cohort Semantic Map</h4>
                                 <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mt-0.5">Automated Variable Alignment</p>
                              </div>
                            </div>
                            <button onClick={() => setShowHarmonisation(false)} className="p-2 bg-slate-800 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700 transition-all">
                              <X className="w-5 h-5" />
                            </button>
                          </div>

                          {isHarmonising ? (
                            <div className="py-24 flex flex-col items-center justify-center space-y-4">
                              <div className="w-14 h-14 border-[4px] border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
                              <div className="text-center">
                                <p className="text-purple-300 text-sm font-bold uppercase tracking-widest animate-pulse">Analysing Semantics</p>
                                <p className="text-slate-500 text-xs mt-2">Grouping similar clinical concepts across {cohorts.length} datasets...</p>
                              </div>
                            </div>
                          ) : harmonisationGroups.length > 0 ? (
                            <div className="grid grid-cols-1 gap-5">
                              {harmonisationGroups.map((group, idx) => (
                                <div key={idx} className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 transition-all hover:border-purple-500/30 group/hgroup">
                                  <div className="flex items-center justify-between mb-4">
                                    <h5 className="font-bold text-white flex items-center gap-2 group-hover/hgroup:text-purple-300 transition-colors">
                                      {group.harmonised_name}
                                      <span className="px-2 py-0.5 bg-purple-900/40 text-purple-400 rounded-full text-xs font-black uppercase">{group.variables.length} Variables</span>
                                    </h5>
                                    <div className="group relative">
                                      <Info className="w-4 h-4 text-slate-500 cursor-help hover:text-purple-400 transition-colors" />
                                      <div className="absolute right-0 bottom-full mb-2 w-64 bg-slate-950 border border-slate-800 p-3 rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50">
                                         <p className="text-xs text-slate-300 leading-relaxed font-medium"><span className="text-purple-400 font-bold uppercase mr-1">Logic:</span> {group.reasoning}</p>
                                      </div>
                                    </div>
                                  </div>
                                  <p className="text-xs text-slate-400 mb-5 leading-relaxed bg-slate-950/30 p-3 rounded-xl border border-slate-800/50">{group.description}</p>
                                  <div className="space-y-3 mb-5">
                                    {group.variables.map((v, vi) => (
                                      <div key={vi} className="flex items-start gap-4 bg-slate-950/40 p-3 rounded-xl border border-slate-800/50 hover:border-slate-700 transition-all">
                                        <div className="text-xs font-black text-purple-500 uppercase min-w-[50px] pt-1">{v.cohort}</div>
                                        <div className="flex-1">
                                          <div className="text-xs font-bold mb-1.5 text-slate-200">{v.original_name}</div>
                                          <div className="flex items-center gap-2 py-1 px-2 bg-emerald-500/5 rounded border border-emerald-500/10">
                                            <FileCode className="w-3 h-3 text-emerald-500" />
                                            <code className="text-xs text-emerald-400 font-mono">{v.mapping}</code>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="mt-4 pt-4 border-t border-slate-700/50">
                                     <div className="flex items-center justify-between">
                                        <div className="text-xs uppercase font-black text-slate-500 tracking-widest">Proposed Standard</div>
                                        <div className="text-xs font-mono text-purple-300 bg-purple-500/5 px-2 py-1 rounded border border-purple-500/20">{group.standardized_values}</div>
                                     </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="py-20 flex flex-col items-center justify-center text-center space-y-4">
                              <div className="p-4 bg-slate-800 rounded-full">
                                <AlertCircle className="w-10 h-10 text-slate-600" />
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-300 text-lg">No Clear Overlaps Detected</h4>
                                <p className="text-slate-500 text-sm max-w-sm mt-1">Try selecting variables from different cohorts that share a similar conceptual basis (e.g., Age, Gender, Diagnosis codes).</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Grouped Cart Inventory */}
                    <div className="space-y-4">
                      {cartCohorts.map(cohortName => {
                        const cohortVarsInCart = cart.filter(v => v.cohort_name === cohortName);
                        const tablesInCart = [...new Set(cohortVarsInCart.map(v => v.table_name))];
                        const isCohortExpanded = expandedCartCohorts[cohortName] !== false;

                        return (
                          <div key={cohortName} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                            <div 
                              className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between cursor-pointer group"
                              onClick={() => setExpandedCartCohorts({...expandedCartCohorts, [cohortName]: !isCohortExpanded})}
                            >
                              <div className="flex items-center gap-3">
                                {isCohortExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                  <Package className="w-4 h-4 text-purple-600" />
                                  {cohortName}
                                </h3>
                                <span className="px-2 py-0.5 bg-slate-200 text-slate-500 rounded-full text-xs font-bold">{cohortVarsInCart.length} Vars</span>
                              </div>
                              <button 
                                onClick={(e) => { e.stopPropagation(); removeTableFromCart(cohortVarsInCart); }}
                                className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            {isCohortExpanded && (
                              <div className="divide-y divide-slate-100">
                                {tablesInCart.map(tableName => {
                                  const tableVarsInCart = cohortVarsInCart.filter(v => v.table_name === tableName);
                                  const tableKey = `cart-${cohortName}-${tableName}`;
                                  const isTableExpanded = expandedCartTables[tableKey] !== false;

                                  return (
                                    <div key={tableName} className="bg-white">
                                      <div 
                                        className="w-full px-8 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-50 last:border-0"
                                        onClick={() => setExpandedCartTables({...expandedCartTables, [tableKey]: !isTableExpanded})}
                                      >
                                        <div className="flex items-center gap-3">
                                          <span className="text-slate-300">
                                            {isTableExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                          </span>
                                          <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">{tableName}</h4>
                                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded-full text-[10px] font-bold">{tableVarsInCart.length}</span>
                                        </div>
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); removeTableFromCart(tableVarsInCart); }}
                                          className="p-1.5 text-slate-300 hover:text-red-400 transition-colors"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>

                                      {isTableExpanded && (
                                        <div className="flex flex-col gap-2 p-3 bg-slate-50 border-t border-slate-100">
                                          {tableVarsInCart.map(v => (
                                            <div key={v.variable_name} className="group relative bg-white p-3 rounded-xl border border-slate-200 hover:border-purple-300 hover:shadow-sm transition-all">
                                              <div className="flex items-start gap-3">
                                                <div className="flex-1 min-w-0 space-y-1.5">
                                                  <div className="flex items-center gap-2">
                                                    <h5 className="font-bold text-slate-800 text-sm truncate select-all">{v.variable_name}</h5>
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider ${['Integer', 'Float', 'Number'].some(t => v.datatype?.includes(t)) ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                                                      {v.datatype}
                                                    </span>
                                                  </div>
                                                  
                                                  <p className="text-xs text-slate-600 leading-relaxed font-medium line-clamp-2">
                                                    {v.variable_description}
                                                  </p>

                                                  <div className="flex items-center gap-3 pt-1">
                                                    <div className="flex items-center gap-1.5" title={`Data Completeness: ${v.completeness}%`}>
                                                      <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                                        <div className={`h-full rounded-full ${v.completeness > 80 ? 'bg-emerald-500' : v.completeness > 50 ? 'bg-amber-400' : 'bg-red-400'}`} style={{width: `${v.completeness}%`}}></div>
                                                      </div>
                                                      <span className="text-[10px] font-bold text-slate-500">{v.completeness}%</span>
                                                    </div>
                                                    <div className="h-2.5 w-px bg-slate-200"></div>
                                                    <span className="text-[10px] text-slate-400 font-medium truncate max-w-[200px]">
                                                      Values: <span className="text-slate-700 font-bold">{v.values}</span>
                                                    </span>
                                                  </div>
                                                </div>

                                                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity self-start">
                                                  <button 
                                                      onClick={() => findSimilarVariables(v)}
                                                      className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all"
                                                      title="Find similar variables in other cohorts"
                                                  >
                                                      <Sparkles className="w-4 h-4" />
                                                  </button>
                                                  <button 
                                                      onClick={() => removeFromCart(v)}
                                                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                      title="Remove from cart"
                                                  >
                                                      <Trash2 className="w-4 h-4" />
                                                  </button>
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

       {/* Detailed Variable View Modal */}
       {expandedVariable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
             {/* Header */}
             <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
               <div>
                  <div className="flex items-center gap-2 mb-2">
                     <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-xs font-bold uppercase tracking-wider">{expandedVariable.cohort_name}</span>
                     <span className="text-slate-300">•</span>
                     <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-xs font-bold uppercase tracking-wider">{expandedVariable.table_name}</span>
                  </div>
                  <h3 className="font-bold text-xl text-slate-800 break-all">{expandedVariable.variable_name}</h3>
               </div>
               <button onClick={() => setExpandedVariable(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                 <X className="w-6 h-6" />
               </button>
             </div>

             {/* Content */}
             <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-6">
                   <div className="bg-slate-50 p-5 rounded-xl border border-slate-100">
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2">Description</h4>
                      <p className="text-lg text-slate-700 leading-relaxed font-medium">{expandedVariable.variable_description}</p>
                   </div>

                   <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-1">
                         <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Data Type</h4>
                         <p className="font-bold text-slate-700 bg-blue-50 text-blue-700 inline-block px-3 py-1 rounded-lg border border-blue-100 text-sm">{expandedVariable.datatype}</p>
                      </div>
                      <div className="space-y-1">
                         <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Completeness</h4>
                         <div className="flex items-center gap-3">
                            <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                               <div className={`h-full rounded-full ${expandedVariable.completeness > 80 ? 'bg-emerald-500' : expandedVariable.completeness > 50 ? 'bg-amber-400' : 'bg-red-400'}`} style={{width: `${expandedVariable.completeness}%`}}></div>
                            </div>
                            <span className="font-bold text-slate-700 text-sm">{expandedVariable.completeness}%</span>
                         </div>
                      </div>
                   </div>

                   <div className="space-y-2">
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Values / Coding</h4>
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 font-mono text-sm text-slate-600 max-h-48 overflow-y-auto whitespace-pre-wrap">
                         {checkIsCategorical(expandedVariable) ? (
                           <div className="flex flex-wrap gap-2">
                               {getSortedValues(expandedVariable.values).map((val, i) => (
                                   <span key={i} className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 shadow-sm">
                                       {val}
                                   </span>
                               ))}
                           </div>
                         ) : (
                           expandedVariable.values
                         )}
                      </div>
                   </div>
                </div>
             </div>

             {/* Footer Actions */}
             <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-4">
                 <button 
                   onClick={() => { setExpandedVariable(null); findSimilarVariables(expandedVariable); }}
                   className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:border-purple-300 hover:text-purple-600 transition-all flex items-center justify-center gap-2 shadow-sm text-sm"
                 >
                   <Sparkles className="w-4 h-4" /> Find Similar Variables
                 </button>
                 
                 {cart.some(item => item.variable_name === expandedVariable.variable_name && item.cohort_name === expandedVariable.cohort_name && item.table_name === expandedVariable.table_name) ? (
                    <button 
                      onClick={() => { removeFromCart(expandedVariable); setExpandedVariable(null); }}
                      className="flex-1 py-3 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition-all flex items-center justify-center gap-2 text-sm"
                    >
                      <Trash2 className="w-4 h-4" /> Remove from Cart
                    </button>
                 ) : (
                    <button 
                      onClick={() => { addToCart(expandedVariable); setExpandedVariable(null); }}
                      className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 shadow-lg shadow-purple-200 transition-all flex items-center justify-center gap-2 text-sm"
                    >
                      <Plus className="w-4 h-4" /> Add to Cart
                    </button>
                 )}
             </div>
          </div>
        </div>
      )}

      {/* Similar Variables Modal */}
      {similarModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
              <div className="pr-8">
                <div className="flex items-center gap-2 mb-1">
                   <div className="p-1.5 bg-purple-100 rounded text-purple-600">
                      <Sparkles className="w-4 h-4" />
                   </div>
                   <h3 className="font-bold text-lg text-slate-800">Similar Variables</h3>
                </div>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Searching for semantic matches for <span className="font-bold text-slate-800">{similarModal.sourceVar?.variable_name}</span> across other cohorts.
                </p>
              </div>
              <button 
                onClick={() => setSimilarModal(prev => ({...prev, isOpen: false}))} 
                className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5"/>
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
              {similarModal.isLoading ? (
                 <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <div className="relative">
                        <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-2 h-2 bg-purple-600 rounded-full"></div>
                        </div>
                    </div>
                    <div className="text-center">
                        <p className="font-bold text-slate-700 animate-pulse">Scanning Data Dictionaries...</p>
                        <p className="text-xs text-slate-400 mt-1">Comparing semantic meanings across cohorts</p>
                    </div>
                 </div>
              ) : similarModal.error ? (
                 <div className="text-center py-12">
                    <div className="bg-red-50 p-4 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8 text-red-500" />
                    </div>
                    <h4 className="text-slate-800 font-bold">Search Failed</h4>
                    <p className="text-slate-500 text-sm mt-1">{similarModal.error}</p>
                 </div>
              ) : similarModal.results.length === 0 ? (
                 <div className="text-center py-12">
                    <div className="bg-slate-100 p-4 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                        <Search className="w-8 h-8 text-slate-400" />
                    </div>
                    <h4 className="text-slate-700 font-bold">No High-Confidence Matches</h4>
                    <p className="text-slate-500 text-sm mt-1">We couldn't find variables in other cohorts that strongly match this concept.</p>
                 </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                     <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Best Matches Found</span>
                     <span className="text-xs font-bold text-purple-600">{similarModal.results.length} results</span>
                  </div>
                  {similarModal.results.map((res, i) => {
                    const inCart = cart.some(item => item.variable_name === res.variable_name && item.cohort_name === res.cohort_name && item.table_name === res.table_name);
                    return (
                        <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 hover:border-purple-300 hover:shadow-md hover:shadow-purple-50 transition-all group">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h5 className="font-bold text-slate-800 truncate">{res.variable_name}</h5>
                                        <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100">
                                            <span className="text-[10px] font-black">{res.similarity_score}% Match</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase tracking-wide">{res.cohort_name}</span>
                                        <span className="text-[10px] text-slate-400">• {res.table_name}</span>
                                    </div>
                                    <p className="text-xs text-slate-600 line-clamp-2 mb-3">{res.variable_description}</p>
                                    <div className="bg-purple-50/50 p-2 rounded-lg border border-purple-100">
                                        <p className="text-[10px] text-purple-700 font-medium leading-relaxed">
                                            <span className="font-bold uppercase text-[9px] mr-1 opacity-70">AI Reasoning:</span>
                                            {res.reason}
                                        </p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => inCart ? removeFromCart(res) : addToCart(res)}
                                    className={`p-3 rounded-xl transition-all shrink-0 ${inCart ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-purple-600 hover:text-white'}`}
                                >
                                    {inCart ? <CheckCircle2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
                <button 
                    onClick={() => setSimilarModal(prev => ({...prev, isOpen: false}))}
                    className="px-6 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-all"
                >
                    Done
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// UI Components
const NavItem = ({ icon, label, active, onClick, badge, disabled }) => (
  <button 
    onClick={onClick}
    disabled={disabled}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all group relative ${
      active 
        ? 'bg-purple-600 text-white shadow-xl shadow-purple-900/40 translate-x-1' 
        : disabled 
          ? 'text-slate-700 opacity-20 cursor-not-allowed' 
          : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'
    }`}
  >
    {React.cloneElement(icon, { className: `w-5 h-5 ${active ? 'text-white' : 'text-slate-600 group-hover:text-purple-400'}` })}
    <span className="flex-1 text-left">{label}</span>
    {badge && <span className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${active ? 'bg-purple-400 text-white' : 'bg-slate-800 text-slate-400 group-hover:bg-purple-900 group-hover:text-purple-300'}`}>{badge}</span>}
    {active && <div className="absolute left-0 top-2 bottom-2 w-1 bg-white rounded-full"></div>}
  </button>
);

export default App;