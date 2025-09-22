import { User } from "../models/user.model"
import { CreateUserDTO, UserResponse, AuthResponse } from "../types/user.types"
import { hashPassword, comparePassword, generateToken } from "../utils/utils"
import { ConflictError, UnauthorizedError, NotFoundError } from "@blueprint/shared"

// Create a new user
export const createUser = async (
  userData: CreateUserDTO
): Promise<AuthResponse> => {
  const existingUser = await User.findOne({ email: userData.email.toLowerCase() })
  if (existingUser) {
    throw new ConflictError("User already exists with this email")
  }

  const hashedPassword = await hashPassword(userData.password)
  const user = new User({
    email: userData.email.toLowerCase(),
    password: hashedPassword,
    name: userData.name,
  })

  await user.save()

  const token = generateToken(user._id.toString(), user.name, user.email)

  return {
    token,
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    },
  }
}

// Authenticate user login
export const loginUser = async (
  email: string,
  password: string
): Promise<AuthResponse> => {
  const user = await User.findOne({ email: email.toLowerCase() })
  if (!user) {
    throw new UnauthorizedError("Invalid credentials")
  }

  const isPasswordValid = await comparePassword(password, user.password)
  if (!isPasswordValid) {
    throw new UnauthorizedError("Invalid credentials")
  }

  const token = generateToken(user._id.toString(), user.name, user.email)

  return {
    token,
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    },
  }
}

// Get user by ID
export const getUserById = async (
  userId: string
): Promise<UserResponse> => {
  const user = await User.findById(userId)
  if (!user) {
    throw new NotFoundError("User not found")
  }
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  }
}
