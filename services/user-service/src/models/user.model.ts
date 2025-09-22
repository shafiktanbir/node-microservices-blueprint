import mongoose, { Document, Schema } from 'mongoose';

export type UserDocument = Document & {
  email: string;
  password: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

const userSchema = new Schema<UserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);


export const User = mongoose.model<UserDocument>('User', userSchema);

