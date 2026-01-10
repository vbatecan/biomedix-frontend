export enum InventoryMode {
  IN = "IN",
  OUT = "OUT"
}

export interface FaceDetection {
  x: number;
  y: number;
  width: number;
  height: number;
  identity?: string;
  confidence?: number;
}

export enum UserRole {
  PHARMACIST = "PHARMACIST",
  IT_ADMIN = "IT_ADMIN",
  USER = "USER"
}

export interface User {
  id?: string;
  face_name: string;
  email: string;
  is_active: boolean;
  role: UserRole;
  created_at?: Date;
  updated_at?: Date;
}


export interface MedicineDetectionResponse {
  results: {
    detection: {
      label: string;
      confidence: number;
      bbox: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    };
    classify: {
      product: string;
      confidence: number;
    };
  }[];
}

export interface MedicineDetection {
  id: string;
  name: string;
  details?: string;
  description?: string;
  confidence: number;
  classifyConfidence?: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  medicine?: Medicine;
  stock?: number;
  image_path?: string;
  lastSeen?: Date;
}

export interface FaceDetectionResult {
  user: User;
  face: {
    box: [number, number, number, number]; // [x, y, width, height]
    left_eye: [number, number] | null;
    right_eye: [number, number] | null;
    confidence: number;
  };
  identity: string;
  confidence: number;
  role: UserRole;
  token: string;
}

export type FaceRecognitionResponse = FaceDetectionResult[];

// Camera Configuration Types
export interface CameraConfig {
  width: number;
  height: number;
  facingMode: 'user' | 'environment';
}

export interface VideoConstraints {
  video: {
    width: { ideal: number };
    height: { ideal: number };
    facingMode: string;
  };
  audio: boolean;
}

export interface Medicine {
  id: string;
  name: string;
  description: string;
  stock: number;
  image_path?: string;
}

export interface TransactionDetail {
  id: number;
  medicine: Medicine;
  quantity: number;
  created_at: Date;
  updated_at: Date;
}

export interface Transaction {
  id?: number;
  user: User;
  mode: InventoryMode;
  transaction_detail: TransactionDetail;
  created_at: Date;
  updated_at: Date;
}

/*
* Response for medicine interaction requests
* The Dispense and Add Stock operation
*/
export interface MedicineInteractionResponse {
  medicine: Medicine;
  transaction: Transaction;
}

export interface SystemStatus {
  isOnline: boolean;
  lastSync: Date;
}

export interface AccessLog {
  id: number;
  user_id: number;
  user?: User;
  action: string;
  timestamp: Date;
}
