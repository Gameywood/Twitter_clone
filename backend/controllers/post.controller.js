import User from '../models/user.model.js';
import Post from '../models/post.model.js';
import { v2 as cloudinary } from 'cloudinary';
import Notification from '../models/notification.model.js';
export const createPost = async (req, res) => {
    try {
        const { text } = req.body;
        let { img } = req.body;
        const userId = req.user._id.toString();

        const user = await User.findById(userId)
        if (!user) return res.status(404).json({ message: "User not found" });
        if (!text && !img) {
            return res.status(400).json({ message: "Post must have text or image" });
        }

        if (img) {
            try {
                // Validate image size (max 5MB)
                const imgSize = Buffer.byteLength(img, 'base64');
                if (imgSize > 5 * 1024 * 1024) {
                    return res.status(400).json({ error: "Image size exceeds 5MB limit" });
                }

                console.log("Attempting Cloudinary upload...");
                console.log("Cloudinary config:", {
                    cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? "set" : "not set",
                    api_key: process.env.CLOUDINARY_API_KEY ? "set" : "not set",
                    api_secret: process.env.CLOUDINARY_API_SECRET ? "set" : "not set"
                });

                const uploadedResponse = await cloudinary.uploader.upload(img, {
                    resource_type: "auto",
                    chunk_size: 6000000, // 6MB chunks
                    timestamp: Math.round(Date.now()/1000),
                    invalidate: true
                });
                console.log("Cloudinary upload successful:", uploadedResponse);
                img = uploadedResponse.secure_url;
            } catch (error) {
                console.error("Cloudinary upload error details:", {
                    message: error.message,
                    stack: error.stack,
                    response: error.response
                });
                return res.status(500).json({ 
                    error: "Failed to upload image to Cloudinary",
                    details: error.message 
                });
            }
        }
        const newPost = new Post({
            user: userId,
            text,
            img,
        })

        await newPost.save();
        res.status(201).json(newPost);
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
        console.log("Error in createPost controller:", error);
    }
};

export const deletePost = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id)
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        if (post.user.toString() !== req.user._id.toString()) {
            return res.status(401).json({ error: "You are not authorized to delete this post" })
        }

        if (post.img) {
            const imgId = post.img.split("/").pop().split(".")[0];
            await cloudinary.uploader.destroy(imgId);
        }
        
        await Post.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Post deleted successfully" });
    } catch (error) {
        console.log("Error in deletePost controller:", error);
        res.status(500).json({ error: "Internal server error" });
    }

}

export const commentOnPost = async (req, res) => {

    try {
        const { text } = req.body;
        const postId = req.params.id;
        const userId = req.user._id;

        if (!text) {
            return res.status(400).json({ error: "Text Field is required" })
        }
        const post = await Post.findById(postId)

        if (!post) {
            return res.status(404).json({ error: "Post not found" })
        }

        const comment = { user: userId, text }

        post.comments.push(comment);
        await post.save();

        res.status(200).json(post)
    } catch (error) {
        console.log("Error in commentOnPost controller:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

export const likeUnlikePost = async (req, res) => {
    try {
        const userId = req.user._id;
        const { id: postId } = req.params;

        const post = await Post.findById(postId);

        if (!post) {
            return res.status(404).json({ error: "Post not found" })
        }

        const userLikedPost = post.likes.includes(userId);


        if (userLikedPost) {
            await Post.updateOne({ _id: postId }, { $pull: { likes: userId } })
            await User.updateOne({_id: userId},{ $pull: { likedPosts: postId}})

            const updatedLikes = post.likes.filter((id) => id.toString() !== userId.toString());
            res.status(200).json(updatedLikes);

        } else { 
            post.likes.push(userId);
            await User.updateOne({_id:userId},{ $push: {likedPosts: postId}})
            await post.save();

            const notification = new Notification({
                from: userId, 
                to: post.user,
                type: "like"
            })
            await notification.save();
            
            const updatedlikes = post.likes;
            res.status(200).json(updatedlikes);
        }
    } catch (error) {
        console.log("Error in likeUnlikePost controller:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};


export const getAllPosts = async (req, res) => {
    try {
        const posts = await Post.find()
            .sort({ createdAt: -1 })
            .populate({
                path: 'user',
                select: "-password",
            })
            .populate({
                path: 'comments.user',
                select: "-password"
            });

        if (posts.length === 0) {
            return res.status(200).json([]);
        }

        res.status(200).json(posts);
    } catch (error) {
        console.log("Error in getAllPosts controller:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const getLikedPosts = async (req, res) => {
    const userId = req.params.id;
    console.log('Fetching liked posts for user:', userId);
    
    try {
        const user = await User.findById(userId);
        if(!user) {
            console.log('User not found');
            return res.status(404).json ({error:"User not found"});
        }
        console.log('User found. Liked posts:', user.likedPosts);

        const likedPosts = await Post.find({_id: {$in: user.likedPosts}})
        .populate({
            path: 'user',
            select: "-password"
        }).populate({
            path: "comments.user",
            select: "-password"
        })

      res.status(200).json(likedPosts);
    } catch (error){
        console.log("Error in getLinkedPosts controller:",error)
        res.status(500).json({error:"Internal server error"})
    }
}

export const getFollowingPosts = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        const following =  user.following;

        const feedPosts = await Post.find({ _id: { $in: following } })
        .sort({ createdAt: -1}).
        populate({
            path: 'user',

        })
        .populate({
            path: "comments.user",
            select: "-password",
        })   

        res.status(200).json(feedPosts);
    }
    catch (error){
        console.log("Error in getFollowingPosts controller:",error)
        res.status(500).json({error:"Internal server error"})

    }
}

export const getUserPosts = async (req,res) => {
    try {
        const {username} = req.params;

        const user = await User.findOne({username});
        if (!user) return res.status(404).json({error: "User not found"});

        const posts = await Post.find({user: user._id}).sort({ createdAt: -1}).populate({
            path: "user",
            select: "-password",
        }).populate({
            path: "comments.user",
            select:"-password",
        }); 

        res.status(200).json(posts);
    }

    catch (error){
         console.log("Error in getUserPosts controller:",error);
         res.status(500).json({error:"Internal server error"});
    }
}