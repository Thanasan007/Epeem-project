

import React, { useState, useEffect, useCallback, useMemo, createContext, useContext, useReducer, useRef } from 'react';
import { Photo, Album, User, View, Modal } from './types';
import { findMatchingFaces, findPhotosByDescription } from './services/geminiService';
import { Icons } from './components/Icons';

// --- STATE MANAGEMENT (Context & Reducer) ---
const ADMIN_EMAIL = "thanasanwetchasit@gmail.com";
const APP_STORAGE_KEY = 'epeemGalleryState';

type State = {
  albums: Album[];
  user: User | null;
};

type Action =
  | { type: 'LOGIN'; email: string }
  | { type: 'LOGOUT' }
  | { type: 'CREATE_ALBUM'; name: string }
  | { type: 'DELETE_ALBUM'; albumId: string }
  | { type: 'ADD_PHOTOS'; albumId: string; photos: Photo[] }
  | { type: 'DELETE_PHOTO'; albumId: string; photoId: string }
  | { type: 'SET_COVER_PHOTO'; albumId: string; photoId: string }
  | { type: 'REPLACE_STATE'; newState: State };

const loadState = (): State => {
    try {
        const serializedState = localStorage.getItem(APP_STORAGE_KEY);
        if (serializedState === null) {
            return { albums: [], user: null };
        }
        const savedState = JSON.parse(serializedState);

        // Backward compatibility for old state format (just an array of albums)
        if (Array.isArray(savedState)) {
            return { albums: savedState, user: null };
        }

        // For new state format: { albums: [], user: {} }
        if (savedState && typeof savedState === 'object' && 'albums' in savedState) {
            return {
                albums: Array.isArray(savedState.albums) ? savedState.albums : [],
                user: savedState.user || null // Will be null if not present
            };
        }
        
        // Fallback for invalid data
        return { albums: [], user: null };

    } catch (err) {
        console.error("Could not load state from local storage", err);
        return { albums: [], user: null };
    }
};

function photoReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOGIN':
      return {
        ...state,
        user: {
          email: action.email,
          isAdmin: action.email.toLowerCase() === ADMIN_EMAIL,
        },
      };
    case 'LOGOUT':
      return { ...state, user: null };
    case 'CREATE_ALBUM':
        if (state.albums.some(a => a.name === action.name)) {
            alert("อัลบั้มชื่อนี้มีอยู่แล้ว");
            return state;
        }
      const newAlbum: Album = {
        id: `album-${Date.now()}`,
        name: action.name,
        photos: [],
      };
      return { ...state, albums: [...state.albums, newAlbum] };
    case 'DELETE_ALBUM':
      return {
        ...state,
        albums: state.albums.filter((album) => album.id !== action.albumId),
      };
    case 'ADD_PHOTOS':
      return {
        ...state,
        albums: state.albums.map((album) => {
          if (album.id === action.albumId) {
            const updatedPhotos = [...album.photos, ...action.photos];
            const newCoverId = album.coverPhotoId || updatedPhotos[0]?.id;
            return { ...album, photos: updatedPhotos, coverPhotoId: newCoverId };
          }
          return album;
        }),
      };
    case 'DELETE_PHOTO':
       return {
        ...state,
        albums: state.albums.map((album) => {
          if (album.id === action.albumId) {
            const updatedPhotos = album.photos.filter((p) => p.id !== action.photoId);
            let newCoverId = album.coverPhotoId;
            if (album.coverPhotoId === action.photoId) {
              newCoverId = updatedPhotos[0]?.id;
            }
            return { ...album, photos: updatedPhotos, coverPhotoId: newCoverId };
          }
          return album;
        }),
      };
    case 'SET_COVER_PHOTO':
        return {
            ...state,
            albums: state.albums.map((album) =>
                album.id === action.albumId ? { ...album, coverPhotoId: action.photoId } : album
            ),
        };
    case 'REPLACE_STATE':
        return action.newState;
    default:
      return state;
  }
}

const AppContext = createContext<{ state: State; dispatch: React.Dispatch<Action> } | undefined>(undefined);

const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within a AppProvider');
  return context;
};

// --- UI HELPER COMPONENTS ---
const Spinner = ({ className = "w-8 h-8" }: { className?: string}) => (
    <svg className={`animate-spin text-brand-action ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

const ProgressBar = ({ value }: { value: number }) => (
    <div className="w-full bg-gray-200 rounded-full h-1.5">
        <div className="bg-brand-action h-1.5 rounded-full transition-all duration-300" style={{ width: `${value}%` }}></div>
    </div>
);

const ModalContainer = ({ children, onClose }: { children: React.ReactNode, onClose: () => void }) => {
    return (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn p-4"
            onClick={onClose}
        >
            <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md relative animate-scaleIn text-gray-800" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-800 transition-colors" aria-label="Close modal">
                    <Icons.close className="w-6 h-6" />
                </button>
                {children}
            </div>
        </div>
    );
};

// --- MODALS ---
const LoginModal = ({ setModal }: { setModal: (modal: Modal) => void }) => {
  const { dispatch } = useAppContext();
  const [email, setEmail] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      if (email.toLowerCase() === ADMIN_EMAIL) {
          alert("สำหรับแอดมิน กรุณาล็อคอินผ่าน Google");
          return;
      }
      dispatch({ type: 'LOGIN', email });
      setModal('NONE');
    }
  };

  const handleAdminLogin = () => {
      dispatch({ type: 'LOGIN', email: ADMIN_EMAIL });
      setModal('NONE');
  };

  return (
    <ModalContainer onClose={() => setModal('NONE')}>
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-900">เข้าสู่ระบบ</h2>
        <form onSubmit={handleLogin}>
          <label htmlFor="email-input" className="sr-only">อีเมลสำหรับผู้ใช้งานทั่วไป</label>
          <input
            id="email-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="กรอกอีเมลสำหรับผู้ใช้งานทั่วไป"
            className="w-full p-3 bg-gray-100 border border-gray-300 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-action"
            required
          />
          <button type="submit" className="w-full mt-6 bg-brand-action hover:bg-brand-action-hover text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-105">
            เข้าสู่ระบบ
          </button>
        </form>

        <div className="relative flex py-5 items-center">
            <div className="flex-grow border-t border-gray-200"></div>
            <span className="flex-shrink mx-4 text-gray-400 text-sm">หรือ</span>
            <div className="flex-grow border-t border-gray-200"></div>
        </div>

        <button 
            onClick={handleAdminLogin}
            type="button"
            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-action transition-all duration-200"
        >
            <Icons.google className="w-5 h-5" />
            <span className="font-semibold">เข้าสู่ระบบด้วย Google (สำหรับแอดมิน)</span>
        </button>
    </ModalContainer>
  );
};

const CreateAlbumModal = ({ setModal }: { setModal: (modal: Modal) => void }) => {
    const { dispatch } = useAppContext();
    const [name, setName] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim()) {
            dispatch({ type: 'CREATE_ALBUM', name: name.trim() });
            setModal('NONE');
        }
    };

    return (
      <ModalContainer onClose={() => setModal('NONE')}>
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-900">สร้างอัลบั้มใหม่</h2>
        <form onSubmit={handleSubmit}>
            <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ชื่ออัลบั้ม"
                className="w-full p-3 bg-gray-100 border border-gray-300 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-action"
                required
                autoFocus
            />
            <button type="submit" className="w-full mt-6 bg-brand-action hover:bg-brand-action-hover text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-105">
                สร้างอัลบั้ม
            </button>
        </form>
      </ModalContainer>
    );
};

const ApiKeyModal = ({ setModal }: { setModal: (modal: Modal) => void }) => {
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini-api-key') || '');

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        if (apiKey.trim()) {
            localStorage.setItem('gemini-api-key', apiKey.trim());
            alert('บันทึก API Key เรียบร้อยแล้ว');
            setModal('NONE');
        } else {
            localStorage.removeItem('gemini-api-key');
            alert('ลบ API Key เรียบร้อยแล้ว');
            setModal('NONE');
        }
    };
    
    return (
        <ModalContainer onClose={() => setModal('NONE')}>
            <h2 className="text-2xl font-bold mb-2 text-center text-gray-900">ตั้งค่า Gemini API Key</h2>
            <p className="text-center text-gray-500 mb-6 text-sm">
                API Key ของคุณจะถูกเก็บไว้ในเบราว์เซอร์ของคุณเท่านั้น
            </p>
            <form onSubmit={handleSave}>
                <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="กรอก Google Gemini API Key ของคุณ"
                    className="w-full p-3 bg-gray-100 border border-gray-300 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-action"
                />
                <p className="text-xs text-gray-500 mt-2">
                    คุณสามารถรับ API Key ได้จาก{' '}
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-brand-link hover:underline">
                        Google AI Studio
                    </a>.
                </p>
                <button type="submit" className="w-full mt-6 bg-brand-action hover:bg-brand-action-hover text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-105">
                    บันทึก
                </button>
            </form>
        </ModalContainer>
    );
};

const ImageViewModal = ({ modal, setModal }: { modal: { type: 'VIEW_PHOTO'; photo: Photo; albumId: string }, setModal: (modal: Modal) => void }) => {
    const { state, dispatch } = useAppContext();
    const { albumId } = modal;
    
    const album = state.albums.find(a => a.id === albumId);
    const photos = album?.photos || [];

    const [currentIndex, setCurrentIndex] = useState(() => photos.findIndex(p => p.id === modal.photo.id));
    
    const currentPhoto = photos[currentIndex];

    useEffect(() => {
        const newIndex = photos.findIndex(p => p.id === modal.photo.id);
        if (newIndex !== -1) {
            setCurrentIndex(newIndex);
        }
    }, [modal.photo.id, photos]);
    
    const handleNext = useCallback(() => {
        setCurrentIndex(prev => (prev + 1) % photos.length);
    }, [photos.length]);

    const handlePrev = useCallback(() => {
        setCurrentIndex(prev => (prev - 1 + photos.length) % photos.length);
    }, [photos.length]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') handleNext();
            if (e.key === 'ArrowLeft') handlePrev();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleNext, handlePrev]);

    if (!currentPhoto || !album) {
        // If the photo or album is gone (e.g., deleted while modal is open), close the modal.
        useEffect(() => {
            setModal('NONE');
        },[setModal]);
        return null;
    }

    const handleDownload = () => {
        const link = document.createElement('a');
        link.href = currentPhoto.url;
        link.download = currentPhoto.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    const handleDelete = () => {
        if(window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบรูปภาพ "${currentPhoto.name}"?`)){
            dispatch({ type: 'DELETE_PHOTO', albumId: album.id, photoId: currentPhoto.id });
            if(photos.length <= 1) {
                setModal('NONE');
            } else {
                handlePrev();
            }
        }
    };
    
    const handleSetCover = () => {
        dispatch({ type: 'SET_COVER_PHOTO', albumId: album.id, photoId: currentPhoto.id });
        alert('ตั้งเป็นภาพปกเรียบร้อยแล้ว');
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-50 animate-fadeIn p-4" onClick={() => setModal('NONE')}>
            <button onClick={() => setModal('NONE')} className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 z-50" aria-label="Close image viewer">
                <Icons.close className="w-7 h-7" />
            </button>
            
            <div className="relative w-full h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
                {photos.length > 1 && (
                    <>
                    <button onClick={handlePrev} className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 bg-black/40 text-white p-3 rounded-full hover:bg-black/60 transition-all z-50" aria-label="Previous image">
                        <Icons.arrowLeft className="w-6 h-6" />
                    </button>
                    <button onClick={handleNext} className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 bg-black/40 text-white p-3 rounded-full hover:bg-black/60 transition-all z-50" aria-label="Next image">
                        <Icons.arrowRight className="w-6 h-6" />
                    </button>
                    </>
                )}
                <div className="max-w-full max-h-full flex items-center justify-center animate-scaleIn">
                    <img src={currentPhoto.url} alt={currentPhoto.name} className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg shadow-2xl" />
                </div>
            </div>

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm p-3 rounded-2xl flex flex-wrap items-center justify-center gap-3" onClick={e => e.stopPropagation()}>
                <p className="text-lg font-semibold truncate text-white hidden md:block">{currentPhoto.name}</p>
                <div className="flex items-center gap-2">
                    {state.user?.isAdmin && (
                        <>
                            <button onClick={handleSetCover} className="flex items-center gap-2 bg-blue-600/80 hover:bg-blue-600 text-white font-bold py-2 px-3 rounded-lg transition-colors" title="ตั้งเป็นภาพปก">
                                <Icons.cover className="w-5 h-5" /> <span className="hidden sm:inline">ตั้งเป็นปก</span>
                            </button>
                            <button onClick={handleDelete} className="flex items-center gap-2 bg-red-600/80 hover:bg-red-600 text-white font-bold py-2 px-3 rounded-lg transition-colors" title="ลบรูปภาพ">
                                <Icons.trash className="w-5 h-5" /> <span className="hidden sm:inline">ลบ</span>
                            </button>
                        </>
                    )}
                    <button onClick={handleDownload} className="flex items-center gap-2 bg-green-600/80 hover:bg-green-600 text-white font-bold py-2 px-3 rounded-lg transition-colors" title="ดาวน์โหลดรูปภาพ">
                       <Icons.download className="w-5 h-5" /> <span className="hidden sm:inline">ดาวน์โหลด</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- VIEWS ---

const AlbumGrid = ({ setView, setModal }: { setView: (view: View) => void; setModal: (modal: Modal) => void }) => {
    const { state, dispatch } = useAppContext();
    const { albums, user } = state;

    const handleDelete = (e: React.MouseEvent, albumId: string, albumName: string) => {
        e.stopPropagation();
        if (window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบอัลบั้ม "${albumName}"? การกระทำนี้ไม่สามารถย้อนกลับได้`)) {
            dispatch({ type: 'DELETE_ALBUM', albumId });
        }
    };
    
    const getCoverUrl = (album: Album) => {
        if (!album.coverPhotoId) return null;
        const coverPhoto = album.photos.find(p => p.id === album.coverPhotoId);
        return coverPhoto?.url || null;
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8 p-8 animate-slideInUp">
            {user?.isAdmin && (
                <button onClick={() => setModal('CREATE_ALBUM')} className="group aspect-[4/3] border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-500 hover:bg-gray-50 hover:border-brand-action hover:text-brand-action transition-all duration-300">
                    <Icons.add className="w-12 h-12 mb-2 transition-transform group-hover:scale-110 text-gray-400 group-hover:text-brand-action" />
                    <span className="font-semibold text-lg">สร้างอัลบั้มใหม่</span>
                </button>
            )}
            {albums.map(album => {
                const coverUrl = getCoverUrl(album);
                return (
                <div key={album.id} className="group relative border border-gray-200 rounded-lg overflow-hidden shadow-sm hover:shadow-lg transition-shadow duration-300 animate-scaleIn">
                    <div onClick={() => setView({ type: 'ALBUM_DETAIL', albumId: album.id })} className="cursor-pointer">
                        <div className="aspect-[4/3] bg-gray-100 flex items-center justify-center">
                            {coverUrl ? (
                                <img src={coverUrl} alt={album.name} className="w-full h-full object-cover" />
                            ) : (
                                <Icons.placeholder className="w-16 h-16 text-gray-400" />
                            )}
                        </div>
                        <div className="p-4 bg-white">
                            <h3 className="font-bold text-lg text-gray-800 truncate">{album.name}</h3>
                            <p className="text-sm text-brand-text-light">{album.photos.length} รูปภาพ</p>
                        </div>
                    </div>
                    {user?.isAdmin && (
                        <button onClick={(e) => handleDelete(e, album.id, album.name)} className="absolute top-2 right-2 bg-white/70 backdrop-blur-sm p-2 rounded-full text-gray-600 hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100" aria-label={`Delete album ${album.name}`}>
                            <Icons.trash className="w-5 h-5"/>
                        </button>
                    )}
                </div>
            )})}
        </div>
    );
};

const PhotoThumbnail = ({ photo, onClick }: { photo: Photo, onClick: () => void }) => (
     <div onClick={onClick} className="group relative rounded-lg overflow-hidden shadow-lg cursor-pointer animate-scaleIn aspect-square border border-gray-100">
         <img src={photo.url} alt={photo.name} className="w-full h-full object-cover transform transition-transform duration-300 group-hover:scale-110" />
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
           <Icons.view className="w-10 h-10 text-white" />
        </div>
    </div>
);

const AlbumDetailView = ({ album, setView, setModal }: { album: Album, setView: (view: View) => void; setModal: (modal: Modal) => void }) => {
    const { state, dispatch } = useAppContext();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const newPhotos: Photo[] = [];
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const url = e.target?.result as string;
                if(url) {
                    newPhotos.push({
                        id: `photo-${Date.now()}-${Math.random()}`,
                        name: file.name,
                        url,
                    });
                    
                    if(newPhotos.length === files.length) {
                        dispatch({ type: 'ADD_PHOTOS', albumId: album.id, photos: newPhotos });
                    }
                }
            };
            reader.readAsDataURL(file);
        });
    };

    return (
        <div className="p-8 animate-slideInUp">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
                 <button onClick={() => setView({ type: 'ALBUM_GRID' })} className="flex items-center gap-2 text-brand-text-light hover:text-gray-900 transition-colors text-lg">
                    <Icons.arrowLeft className="w-6 h-6" />
                    กลับไปที่อัลบั้ม
                </button>
                <div className="flex-1 text-center">
                    <h1 className="text-4xl font-bold text-gray-900">{album.name}</h1>
                </div>
                {state.user?.isAdmin ? (
                    <button onClick={() => fileInputRef.current?.click()} className="bg-brand-action hover:bg-brand-action-hover text-white font-bold py-2 px-5 rounded-lg transition-all duration-300 flex items-center gap-2 text-lg">
                        <Icons.add className="w-6 h-6"/> อัปโหลด
                    </button>
                ) : <div className="w-36"></div>}
                <input type="file" multiple accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
            </div>

            {album.photos.length === 0 ? (
                <div className="text-center py-20 text-gray-400 animate-fadeIn">
                    <Icons.placeholder className="w-24 h-24 mx-auto mb-4"/>
                    <p className="text-xl">ยังไม่มีรูปภาพในอัลบั้มนี้</p>
                    {state.user?.isAdmin && <p className="mt-2 text-gray-500">คลิก "อัปโหลด" เพื่อเริ่มต้น</p>}
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {album.photos.map(photo => (
                        <PhotoThumbnail key={photo.id} photo={photo} onClick={() => setModal({ type: 'VIEW_PHOTO', photo, albumId: album.id })} />
                    ))}
                </div>
            )}
        </div>
    );
};


const SearchResultsView = ({ viewState, setView, setModal }: { viewState: { type: 'SEARCH_RESULTS'; results: Photo[]; queryType: 'face' | 'text'; query: string }, setView: (view: View) => void; setModal: (modal: Modal) => void;}) => {
    return (
         <div className="p-8 animate-slideInUp">
            <div className="flex flex-col items-center justify-center mb-8 relative">
                <button onClick={() => setView({ type: 'ALBUM_GRID' })} className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center gap-2 text-brand-text-light hover:text-gray-900 transition-colors text-lg">
                    <Icons.arrowLeft className="w-6 h-6" />
                    กลับ
                </button>
                <h1 className="text-4xl font-bold text-gray-900">ผลการค้นหา</h1>
                <div className="mt-3 text-center">
                    {viewState.queryType === 'face' ? (
                        <>
                            <p className="text-brand-text-light mt-1">รูปภาพที่ใช้ค้นหา:</p>
                            <img src={viewState.query} alt="Query face" className="w-28 h-28 rounded-full border-4 border-brand-action mt-3 object-cover shadow-lg mx-auto"/>
                        </>
                    ) : (
                        <>
                           <p className="text-brand-text-light mt-1">ค้นหาด้วยคำว่า:</p>
                           <p className="text-2xl font-semibold text-gray-800 p-3 bg-gray-100 rounded-lg inline-block mt-2">"{viewState.query}"</p>
                        </>
                    )}
                </div>
            </div>

            {viewState.results.length === 0 ? (
                <div className="text-center py-20 text-gray-400 animate-fadeIn">
                    <Icons.search className="w-24 h-24 mx-auto mb-4"/>
                    <p className="text-xl">ไม่พบรูปภาพที่ตรงกัน</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {viewState.results.map(photo => {
                        const album = useAppContext().state.albums.find(a => a.photos.some(p => p.id === photo.id));
                        return album ? (
                            <PhotoThumbnail key={photo.id} photo={photo} onClick={() => setModal({ type: 'VIEW_PHOTO', photo, albumId: album.id })} />
                        ) : null;
                    })}
                </div>
            )}
        </div>
    )
}

// --- HEADER & SEARCH BAR ---
const Header = ({ setModal, setView }: { setModal: (modal: Modal) => void; setView: (view: View) => void; }) => {
    const { state, dispatch } = useAppContext();
    const { user } = state;
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const importInputRef = useRef<HTMLInputElement>(null);

    const handleExport = () => {
        try {
            const stateToSave = JSON.stringify(state, null, 2);
            const blob = new Blob([stateToSave], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `epeem-gallery-backup-${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            alert("ส่งออกข้อมูลสำเร็จ!");
        } catch (error) {
            console.error("Failed to export data:", error);
            alert("เกิดข้อผิดพลาดในการส่งออกข้อมูล");
        }
        setUserMenuOpen(false);
    };

    const handleImportClick = () => {
        importInputRef.current?.click();
    };

    const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!window.confirm("การนำเข้าข้อมูลจะเขียนทับข้อมูลปัจจุบันทั้งหมด คุณแน่ใจหรือไม่ว่าต้องการดำเนินการต่อ?")) {
            if (importInputRef.current) importInputRef.current.value = "";
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result as string;
                const newState = JSON.parse(text) as State;
                if (newState && Array.isArray(newState.albums) && 'user' in newState) {
                    dispatch({ type: 'REPLACE_STATE', newState });
                    alert("นำเข้าข้อมูลสำเร็จ!");
                    setView({ type: 'ALBUM_GRID' });
                } else {
                    throw new Error("Invalid data structure in file.");
                }
            } catch (error) {
                console.error("Failed to import data:", error);
                alert(`เกิดข้อผิดพลาดในการนำเข้าข้อมูล: ${error instanceof Error ? error.message : "ไฟล์อาจไม่ถูกต้อง"}`);
            } finally {
                if (importInputRef.current) importInputRef.current.value = "";
            }
        };
        reader.onerror = () => {
             alert("ไม่สามารถอ่านไฟล์ได้");
             if (importInputRef.current) importInputRef.current.value = "";
        }
        reader.readAsText(file);
        setUserMenuOpen(false);
    };

    return (
        <header className="bg-white border-b border-gray-200 p-4 shadow-sm flex justify-between items-center sticky top-0 z-40">
            <h1 onClick={() => setView({type: 'ALBUM_GRID'})} className="text-2xl font-bold cursor-pointer text-gray-800 hover:text-brand-action transition-colors">
              Epeem Gallery
            </h1>
            
            <div>
                {user ? (
                    <div className="relative">
                        <button onClick={() => setUserMenuOpen(o => !o)} className="flex items-center gap-3">
                           <div className="w-10 h-10 bg-brand-action rounded-full flex items-center justify-center font-bold text-xl text-white">
                               {user.email.charAt(0).toUpperCase()}
                           </div>
                           <span className="font-semibold hidden lg:block text-gray-700">{user.email}</span>
                        </button>
                        {userMenuOpen && (
                             <div 
                                className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl py-2 animate-scaleIn border border-gray-100"
                                onMouseLeave={() => setUserMenuOpen(false)}
                            >
                                <div className="px-4 py-2 border-b border-gray-200">
                                    <p className="font-semibold text-sm truncate text-gray-800">{user.email}</p>
                                    <p className="text-xs text-gray-500">{user.isAdmin ? 'Admin' : 'User'}</p>
                                </div>
                                <button
                                    onClick={() => { setModal('API_KEY'); setUserMenuOpen(false); }}
                                    className="w-full text-left flex items-center gap-3 px-4 py-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                                >
                                    <Icons.key className="w-5 h-5" />
                                    ตั้งค่า API Key
                                </button>
                                <div className="border-t border-gray-100 my-1"></div>
                                <button
                                    onClick={handleImportClick}
                                    className="w-full text-left flex items-center gap-3 px-4 py-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                                >
                                    <Icons.importData className="w-5 h-5" />
                                    นำเข้าข้อมูล
                                </button>
                                <button
                                    onClick={handleExport}
                                    className="w-full text-left flex items-center gap-3 px-4 py-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                                >
                                    <Icons.exportData className="w-5 h-5" />
                                    ส่งออกข้อมูล
                                </button>
                                <div className="border-t border-gray-100 my-1"></div>
                                <button 
                                    onClick={() => { dispatch({ type: 'LOGOUT' }); setUserMenuOpen(false); }} 
                                    className="w-full text-left flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                                >
                                    <Icons.logout className="w-5 h-5" />
                                    ออกจากระบบ
                                </button>
                            </div>
                        )}
                         <input type="file" accept=".json,application/json" ref={importInputRef} onChange={handleImportFile} className="hidden" />
                    </div>
                ) : (
                    <button onClick={() => setModal('LOGIN')} className="border border-brand-link text-brand-link font-bold py-2 px-5 rounded-lg hover:bg-brand-link/10 transition-all duration-300">
                        เข้าสู่ระบบ
                    </button>
                )}
            </div>
        </header>
    );
};

const SearchControlBar = ({ setView, setModal }: { setView: (view: View) => void, setModal: (modal: Modal) => void }) => {
    const { state } = useAppContext();
    const { albums } = state;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [searchProgress, setSearchProgress] = useState(0);
    const [textQuery, setTextQuery] = useState("");

    const handleFaceSearchClick = () => {
        const apiKey = localStorage.getItem('gemini-api-key');
        if (!apiKey) {
            alert('โปรดตั้งค่า Gemini API Key ของคุณก่อนใช้งานฟังก์ชันนี้');
            setModal('API_KEY');
            return;
        }
        fileInputRef.current?.click();
    };

    const handleSearchFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const apiKey = localStorage.getItem('gemini-api-key');
        if (!apiKey) {
            return;
        }

        setIsSearching(true);
        setSearchProgress(0);

        const reader = new FileReader();
        reader.onload = async (e) => {
            const queryImage = e.target?.result as string;
            if (queryImage) {
                try {
                    const allPhotos = albums.flatMap(a => a.photos);
                    const results = await findMatchingFaces(apiKey, queryImage, allPhotos, setSearchProgress);
                    setView({type: 'SEARCH_RESULTS', results, queryType: 'face', query: queryImage});
                } catch (error) {
                    console.error("Face search failed:", error);
                    alert(`เกิดข้อผิดพลาดในการค้นหา: ${error instanceof Error ? error.message : String(error)}`);
                    if (error instanceof Error && error.message.includes('API Key')) {
                        setModal('API_KEY');
                    }
                } finally {
                    setIsSearching(false);
                }
            }
        };
        reader.readAsDataURL(file);
        
        if(fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleTextSearch = async () => {
        if (!textQuery.trim()) {
            alert("กรุณาป้อนคำเพื่อค้นหา");
            return;
        }
        const apiKey = localStorage.getItem('gemini-api-key');
        if (!apiKey) {
            alert('โปรดตั้งค่า Gemini API Key ของคุณก่อนใช้งานฟังก์ชันนี้');
            setModal('API_KEY');
            return;
        }

        setIsSearching(true);
        setSearchProgress(0);
        try {
            const allPhotos = albums.flatMap(a => a.photos);
            const results = await findPhotosByDescription(apiKey, textQuery, allPhotos, setSearchProgress);
            setView({type: 'SEARCH_RESULTS', results, queryType: 'text', query: textQuery});
        } catch (error) {
            console.error("Text search failed:", error);
            alert(`เกิดข้อผิดพลาดในการค้นหา: ${error instanceof Error ? error.message : String(error)}`);
            if (error instanceof Error && error.message.includes('API Key')) {
                setModal('API_KEY');
            }
        } finally {
            setIsSearching(false);
        }
    };

    return (
        <div className="px-8 mt-8">
            <div className="p-4 border border-gray-200 rounded-lg max-w-7xl mx-auto bg-white">
                {isSearching ? (
                     <div className="w-full px-4 py-2 text-center">
                         <div className="flex items-center justify-center">
                            <Spinner className="w-6 h-6 inline-block mr-3" />
                            <span className="text-base align-middle text-gray-600">กำลังค้นหาด้วย AI... {searchProgress}%</span>
                         </div>
                         <div className="mt-3">
                             <ProgressBar value={searchProgress} />
                         </div>
                     </div>
                ) : (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="relative w-full sm:flex-1">
                            <Icons.search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                            <input
                                type="text"
                                value={textQuery}
                                onChange={(e) => setTextQuery(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleTextSearch(); }}
                                placeholder="ค้นหาด้วยคำอธิบาย (เช่น 'แมวบนโซฟา')"
                                className="w-full p-3 pl-11 bg-gray-50 border border-gray-300 rounded-lg text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-action"
                            />
                        </div>
                        <div className="flex items-stretch gap-3 w-full sm:w-auto">
                           <button 
                              onClick={handleTextSearch} 
                              className="bg-brand-action hover:bg-brand-action-hover text-white font-bold py-2 px-5 rounded-lg transition-all duration-300 flex items-center justify-center gap-2 text-base flex-1"
                              aria-label="Search by text"
                            >
                                <Icons.search className="w-5 h-5"/>
                                <span>ค้นหา</span>
                            </button>
                            <button 
                              onClick={handleFaceSearchClick} 
                              className="bg-white border border-gray-300 hover:bg-gray-100 text-brand-text font-bold py-2 px-5 rounded-lg transition-all duration-300 flex items-center justify-center gap-2 text-base flex-1"
                              aria-label="Search by face"
                            >
                                <Icons.user className="w-5 h-5"/>
                                <span>ค้นหาใบหน้า</span>
                            </button>
                            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleSearchFileChange} className="hidden" />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};


// --- MAIN APP COMPONENT ---

function App() {
  const [state, dispatch] = useReducer(photoReducer, loadState());
  const [view, setView] = useState<View>({ type: 'ALBUM_GRID' });
  const [modal, setModal] = useState<Modal>('NONE');
  
  useEffect(() => {
    try {
      const serializedState = JSON.stringify(state);
      localStorage.setItem(APP_STORAGE_KEY, serializedState);
    } catch (err) {
      console.error("Could not save state to local storage", err);
    }
  }, [state]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if(e.key === 'Escape') {
            setModal('NONE');
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const renderView = () => {
    switch (view.type) {
      case 'ALBUM_GRID':
        return <AlbumGrid setView={setView} setModal={setModal} />;
      case 'ALBUM_DETAIL':
        const album = state.albums.find(a => a.id === view.albumId);
        if (!album) {
            setView({ type: 'ALBUM_GRID' });
            return null;
        }
        return <AlbumDetailView album={album} setView={setView} setModal={setModal}/>;
      case 'SEARCH_RESULTS':
          return <SearchResultsView viewState={view} setView={setView} setModal={setModal}/>;
      default:
        return <AlbumGrid setView={setView} setModal={setModal} />;
    }
  };
  
  const renderModal = () => {
      if (modal === 'LOGIN') return <LoginModal setModal={setModal} />;
      if (modal === 'CREATE_ALBUM') return <CreateAlbumModal setModal={setModal} />;
      if (modal === 'API_KEY') return <ApiKeyModal setModal={setModal} />;
      if (typeof modal === 'object' && modal.type === 'VIEW_PHOTO') return <ImageViewModal modal={modal} setModal={setModal} />;
      return null;
  }

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <div className="min-h-screen flex flex-col bg-brand-gray">
        <Header setModal={setModal} setView={setView} />
        {view.type === 'ALBUM_GRID' && <SearchControlBar setView={setView} setModal={setModal} />}
        <main className="flex-grow">
          {renderView()}
        </main>
        {renderModal()}
      </div>
    </AppContext.Provider>
  );
}

export default App;