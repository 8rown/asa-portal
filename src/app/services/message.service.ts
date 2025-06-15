import { Injectable } from '@angular/core';
import { Firestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, Timestamp, query, where, orderBy, getDoc } from '@angular/fire/firestore';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';

export interface MessageData {
  id?: string;
  senderId: string;
  senderName: string;
  recipientDepartments: string[];
  to: string; // recipient email
  subject: string;
  message: string;
  // Base64 file storage
  attachedFile?: {
    name: string;
    size: number;
    type: string;
    base64Content: string;
  };
  timestamp: Timestamp;
  status: 'sent' | 'archived' | 'deleted' | 'draft';
  readBy?: string[]; // Array of user IDs who have read the message
  priority?: 'low' | 'normal' | 'high';
  category?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MessageService {
  private readonly MESSAGES_COLLECTION = 'messages';

  constructor(
    private firestore: Firestore,
    private authService: AuthService
  ) {
    console.log('MessageService initialized with Base64 file storage');
  }

  // Create a new message
  async createMessage(messageData: Omit<MessageData, 'id' | 'timestamp' | 'senderId' | 'senderName'>): Promise<string> {
    try {
      const currentUser = this.authService.getCurrentUser();
      if (!currentUser) {
        throw new Error('User must be authenticated to send messages');
      }

      const messagesCollection = collection(this.firestore, this.MESSAGES_COLLECTION);

      const messageToSave: Omit<MessageData, 'id'> = {
        senderId: currentUser.uid,
        senderName: currentUser.fullName,
        recipientDepartments: messageData.recipientDepartments,
        to: messageData.to,
        subject: messageData.subject,
        message: messageData.message,
        attachedFile: messageData.attachedFile,
        timestamp: Timestamp.now(),
        status: messageData.status,
        readBy: [],
        priority: messageData.priority || 'normal',
        category: messageData.category || 'general'
      };

      const docRef = await addDoc(messagesCollection, messageToSave);
      console.log('✅ Message created successfully with ID:', docRef.id);
      return docRef.id;
    } catch (error) {
      console.error('❌ Error creating message:', error);
      throw error;
    }
  }

  // Convert file to Base64
  async convertFileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = () => {
        if (reader.result && typeof reader.result === 'string') {
          // Remove the data URL prefix (e.g., "data:image/png;base64,")
          const base64String = reader.result.split(',')[1];
          resolve(base64String);
        } else {
          reject(new Error('Failed to convert file to Base64'));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Error reading file'));
      };
      
      reader.readAsDataURL(file);
    });
  }

  // Send message with attachment
  async sendMessageWithAttachment(
    messageData: Omit<MessageData, 'id' | 'timestamp' | 'senderId' | 'senderName' | 'attachedFile'>,
    attachmentFile?: File
  ): Promise<string> {
    try {
      let attachedFile: MessageData['attachedFile'] | undefined;

      if (attachmentFile) {
        console.log('📤 Converting attachment to Base64:', attachmentFile.name);
        const base64Content = await this.convertFileToBase64(attachmentFile);
        
        attachedFile = {
          name: attachmentFile.name,
          size: attachmentFile.size,
          type: attachmentFile.type,
          base64Content: base64Content
        };
        
        console.log('✅ File converted to Base64 successfully');
      }

      const messageId = await this.createMessage({
        ...messageData,
        attachedFile,
        status: 'sent'
      });

      return messageId;
    } catch (error) {
      console.error('❌ Error sending message with attachment:', error);
      throw error;
    }
  }

  // Save as draft
  async saveDraft(
    messageData: Omit<MessageData, 'id' | 'timestamp' | 'senderId' | 'senderName'>,
    attachmentFile?: File
  ): Promise<string> {
    try {
      let attachedFile: MessageData['attachedFile'] | undefined;

      if (attachmentFile) {
        console.log('📤 Converting attachment to Base64 for draft:', attachmentFile.name);
        const base64Content = await this.convertFileToBase64(attachmentFile);
        
        attachedFile = {
          name: attachmentFile.name,
          size: attachmentFile.size,
          type: attachmentFile.type,
          base64Content: base64Content
        };
      }

      const messageId = await this.createMessage({
        ...messageData,
        attachedFile,
        status: 'draft'
      });

      console.log('✅ Draft saved successfully');
      return messageId;
    } catch (error) {
      console.error('❌ Error saving draft:', error);
      throw error;
    }
  }

  // Download file from Base64
  downloadFileFromBase64(attachedFile: MessageData['attachedFile']): void {
    if (!attachedFile) {
      console.error('No file to download');
      return;
    }

    try {
      console.log('📥 Downloading file:', attachedFile.name);
      
      // Convert Base64 back to file blob
      const byteCharacters = atob(attachedFile.base64Content);
      const byteNumbers = new Array(byteCharacters.length);
      
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: attachedFile.type });
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachedFile.name;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      window.URL.revokeObjectURL(url);
      
      console.log('✅ File download initiated:', attachedFile.name);
    } catch (error) {
      console.error('❌ Error downloading file:', error);
      throw error;
    }
  }

  // Get messages by status
  async getMessagesByStatus(status: string): Promise<MessageData[]> {
    try {
      const messagesCollection = collection(this.firestore, this.MESSAGES_COLLECTION);
      const q = query(
        messagesCollection, 
        where('status', '==', status),
        orderBy('timestamp', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MessageData[];
    } catch (error) {
      console.error('❌ Error fetching messages:', error);
      throw error;
    }
  }

  // Get messages sent by current user
  async getSentMessages(): Promise<MessageData[]> {
    try {
      const currentUser = this.authService.getCurrentUser();
      if (!currentUser) {
        throw new Error('User must be authenticated');
      }

      const messagesCollection = collection(this.firestore, this.MESSAGES_COLLECTION);
      const q = query(
        messagesCollection,
        where('senderId', '==', currentUser.uid),
        where('status', '==', 'sent'),
        orderBy('timestamp', 'desc')
      );

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MessageData[];
    } catch (error) {
      console.error('❌ Error fetching sent messages:', error);
      throw error;
    }
  }

  // Get inbox messages for current user
  async getInboxMessages(): Promise<MessageData[]> {
    try {
      const currentUser = this.authService.getCurrentUser();
      if (!currentUser) {
        throw new Error('User must be authenticated');
      }

      const messagesCollection = collection(this.firestore, this.MESSAGES_COLLECTION);
      
      const q = query(
        messagesCollection,
        where('status', '==', 'sent'),
        orderBy('timestamp', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const allMessages = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MessageData[];

      // Filter messages for current user's department or direct email
      return allMessages.filter(message => 
        message.to === currentUser.email || 
        message.recipientDepartments.includes(currentUser.department)
      );
    } catch (error) {
      console.error('❌ Error fetching inbox messages:', error);
      throw error;
    }
  }

  // Update message status
  async updateMessageStatus(messageId: string, status: MessageData['status']): Promise<void> {
    try {
      const messageDoc = doc(this.firestore, `${this.MESSAGES_COLLECTION}/${messageId}`);
      await updateDoc(messageDoc, { 
        status,
        updatedAt: Timestamp.now()
      });
      console.log('✅ Message status updated successfully');
    } catch (error) {
      console.error('❌ Error updating message status:', error);
      throw error;
    }
  }

  // Delete message
  async deleteMessage(messageId: string): Promise<void> {
    try {
      const messageDoc = doc(this.firestore, `${this.MESSAGES_COLLECTION}/${messageId}`);
      await deleteDoc(messageDoc);
      console.log('✅ Message deleted successfully');
    } catch (error) {
      console.error('❌ Error deleting message:', error);
      throw error;
    }
  }

  // Mark message as read
  async markAsRead(messageId: string): Promise<void> {
    try {
      const currentUser = this.authService.getCurrentUser();
      if (!currentUser) return;

      const messageDoc = doc(this.firestore, `${this.MESSAGES_COLLECTION}/${messageId}`);
      
      await updateDoc(messageDoc, {
        [`readBy.${currentUser.uid}`]: Timestamp.now()
      });
      
      console.log('✅ Message marked as read');
    } catch (error) {
      console.error('❌ Error marking message as read:', error);
      throw error;
    }
  }

  // Get available departments (for dropdown)
  getDepartments(): string[] {
    return [
      'Human Resources',
      'Finance',
      'Information Technology',
      'Operations',
      'Marketing',
      'Legal',
      'Administration',
      'Communications',
      'Engineering',
      'Sales',
      'Customer Service',
      'Other'
    ];
  }

  // Validate file type and size
  validateFile(file: File): { valid: boolean; error?: string } {
    const maxSize = 10 * 1024 * 1024; // 10MB (reduced for Base64 efficiency)
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 
      'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 
      'text/csv'
    ];

    if (file.size > maxSize) {
      return {
        valid: false,
        error: `File "${file.name}" is too large. Maximum size is 10MB for Base64 storage.`
      };
    }

    if (!allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: `File type "${file.type}" is not allowed. Please upload PDF, DOC, XLS, images, or text files.`
      };
    }

    return { valid: true };
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Get file preview (for images)
  getFilePreviewUrl(attachedFile: MessageData['attachedFile']): string | null {
    if (!attachedFile || !attachedFile.type.startsWith('image/')) {
      return null;
    }
    
    return `data:${attachedFile.type};base64,${attachedFile.base64Content}`;
  }
}
