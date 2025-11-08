// React 垫片文件，用于在Chrome扩展中使用React
import { createRoot } from 'react-dom/client';

// 将React和ReactDOM暴露到全局
window.React = React;
window.ReactDOM = ReactDOM;
window.createRoot = createRoot;