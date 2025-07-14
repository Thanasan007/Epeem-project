
export interface Photo {
  id: string;
  url: string; // Base64 data URL
  name: string;
}

export interface Album {
  id: string;
  name: string;
  photos: Photo[];
  coverPhotoId?: string;
}

export interface User {
  email: string;
  isAdmin: boolean;
}

export type View = 
  | { type: 'ALBUM_GRID' }
  | { type: 'ALBUM_DETAIL'; albumId: string }
  | { type: 'SEARCH_RESULTS'; results: Photo[]; queryType: 'face' | 'text'; query: string };

export type Modal = 
  | 'NONE'
  | 'LOGIN'
  | 'CREATE_ALBUM'
  | { type: 'VIEW_PHOTO'; photo: Photo; albumId: string };