// Angular service for managing document uploads and metadata in Firestore
import { Injectable } from '@angular/core'; // Angular DI
import { Firestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, orderBy, where } from '@angular/fire/firestore'; // Firestore DB
import { Observable, from } from 'rxjs'; // RxJS for async

// Interface representing a document stored in Firestore
export interface FirebaseDocument {
  id?: string; // Firestore document ID
  name: string; // Document name
  description: string; // Document description
  department: string; // Department associated with document
  fileName: string; // Name of the uploaded file
  fileSize: number; // Size of the file in bytes
  fileType: string; // MIME type of the file
  fileData: string; // Base64 encoded file data
  uploadedBy: string; // User who uploaded the file
  uploadedAt: Date; // Upload timestamp
  createdAt: Date; // Document creation timestamp
  createdBy: string; // User who created the document record
}

@Injectable({
  providedIn: 'root'
})
export class DocumentService {
  // Name of the Firestore collection for documents
  private documentsCollection = 'documents';

  constructor(private firestore: Firestore) {}

  // Upload a document file and its metadata to Firestore
  async uploadDocument(
    file: File,
    documentData: {
      name: string;
      description: string;
      department: string;
      uploadedBy: string;
      createdBy: string;
    }
  ): Promise<{ success: boolean; document?: FirebaseDocument; error?: string }> {
    try {
      console.log('📤 Starting document upload...');

      // Convert file to base64 string for storage
      const fileData = await this.fileToBase64(file);
      console.log('✅ File converted to base64');

      // Prepare document data for Firestore (omit id)
      const docData: Omit<FirebaseDocument, 'id'> = {
        name: documentData.name,
        description: documentData.description,
        department: documentData.department,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        fileData: fileData, // Store base64 data directly
        uploadedBy: documentData.uploadedBy,
        uploadedAt: new Date(),
        createdAt: new Date(),
        createdBy: documentData.createdBy
      };

      // Add new document record to Firestore
      const docRef = await addDoc(collection(this.firestore, this.documentsCollection), docData);
      
      console.log('✅ Document saved to Firestore with base64 data');

      return {
        success: true,
        document: {
          id: docRef.id,
          ...docData
        }
      };

    } catch (error: any) {
      console.error('❌ Error uploading document:', error);
      return {
        success: false,
        error: error.message || 'Failed to upload document'
      };
    }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert file to base64'));
        }
      };
      reader.onerror = error => reject(error);
    });
  }

  async getDocuments(): Promise<FirebaseDocument[]> {
    try {
      const q = query(
        collection(this.firestore, this.documentsCollection),
        orderBy('createdAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      const documents: FirebaseDocument[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        documents.push({
          id: doc.id,
          ...data,
          // Convert Firestore timestamps back to Date objects
          createdAt: data['createdAt']?.toDate ? data['createdAt'].toDate() : new Date(data['createdAt']),
          uploadedAt: data['uploadedAt']?.toDate ? data['uploadedAt'].toDate() : new Date(data['uploadedAt'])
        } as FirebaseDocument);
      });

      return documents;
    } catch (error) {
      console.error('Error fetching documents:', error);
      return [];
    }
  }

  async getDocumentsByDepartment(department: string): Promise<FirebaseDocument[]> {
    try {
      const q = query(
        collection(this.firestore, this.documentsCollection),
        where('department', '==', department),
        orderBy('createdAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      const documents: FirebaseDocument[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        documents.push({
          id: doc.id,
          ...data,
          createdAt: data['createdAt']?.toDate ? data['createdAt'].toDate() : new Date(data['createdAt']),
          uploadedAt: data['uploadedAt']?.toDate ? data['uploadedAt'].toDate() : new Date(data['uploadedAt'])
        } as FirebaseDocument);
      });

      return documents;
    } catch (error) {
      console.error('Error fetching documents by department:', error);
      return [];
    }
  }

  async deleteDocument(documentId: string): Promise<boolean> {
    try {
      // Delete from Firestore
      await deleteDoc(doc(this.firestore, this.documentsCollection, documentId));
      console.log('✅ Document deleted from Firestore');
      return true;
    } catch (error) {
      console.error('Error deleting document:', error);
      return false;
    }
  }

  async updateDocument(documentId: string, updates: Partial<FirebaseDocument>): Promise<boolean> {
    try {
      const docRef = doc(this.firestore, this.documentsCollection, documentId);
      await updateDoc(docRef, updates);
      return true;
    } catch (error) {
      console.error('Error updating document:', error);
      return false;
    }
  }

  // Download document by converting base64 back to file
  downloadDocument(document: FirebaseDocument): void {
    try {
      // Convert base64 back to blob
      const byteCharacters = atob(document.fileData.split(',')[1]);
      const byteNumbers = new Array(byteCharacters.length);
      
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: document.fileType });
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = document.fileName;
      window.document.body.appendChild(link);
      link.click();
      
      // Cleanup
      window.URL.revokeObjectURL(url);
      window.document.body.removeChild(link);
      
      console.log('✅ Document downloaded successfully');
    } catch (error) {
      console.error('Error downloading document:', error);
    }
  }

  // View document in new tab
  viewDocument(document: FirebaseDocument): void {
    try {
      // Convert base64 to blob URL
      const byteCharacters = atob(document.fileData.split(',')[1]);
      const byteNumbers = new Array(byteCharacters.length);
      
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: document.fileType });
      
      // Open in new tab
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      
      console.log('✅ Document opened for viewing');
    } catch (error) {
      console.error('Error viewing document:', error);
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
