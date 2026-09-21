// export function buttonTemplate(
//   orderLink,
//   title = " New Order Offer ",
//   description = "A customer request is available in your area.",
// ) {
//   return `
// <!DOCTYPE html>
// <html>
// <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <title>New Order Offer - BINS APP</title>
//     <style>
//         body {
//             font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
//             margin: 0; padding: 0;
//             background-color: #f4f7f6;
//             color: #333333;
//         }
//         .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f6; padding-bottom: 40px; }
//         .container {
//             max-width: 600px;
//             margin: 40px auto 20px;
//             background-color: #ffffff;
//             border-radius: 12px;
//             overflow: hidden;
//             box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
//         }
//         .header { padding: 40px 20px; text-align: center; }
//         .logo { max-width: 120px; height: auto; border-radius: 100%; }
//         .content { padding: 0 40px 30px; text-align: center; }
//         .title { font-size: 28px; font-weight: 700; color: #1a1a1a; margin-bottom: 5px; }
//         .subhead { font-size: 18px; color: #666666; margin-bottom: 25px; }

//         .cta-button {
//             display: inline-block;
//             background-color: #0EBE3C;
//             color: #ffffff !important;
//             padding: 16px 32px;
//             text-decoration: none;
//             font-weight: bold;
//             border-radius: 8px;
//             margin: 20px 0;
//             font-size: 18px;
//         }

//         .main-message { font-size: 16px; color: #444444; line-height: 1.6; margin-bottom: 25px; text-align: left; }

//         /* Signature Footer Block */
//         .sig-footer {
//             max-width: 600px;
//             margin: 0 auto;
//             background-color: #ffffff;
//             border-radius: 12px;
//             padding: 30px 40px;
//             box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
//         }
//         .sig-name { font-size: 18px; font-weight: bold; color: #1a1a1a; margin-bottom: 4px; }
//         .sig-title { font-size: 14px; color: #0EBE3C; font-weight: bold; text-transform: uppercase; margin-bottom: 15px; }
//         .sig-details { font-size: 13px; color: #555555; line-height: 1.8; }
//         .sig-details a { color: #0c64c0; text-decoration: none; font-weight: bold; }
//         .tagline {
//             margin-top: 20px;
//             font-style: italic;
//             color: #0EBE3C;
//             font-weight: 600;
//             border-top: 1px solid #eee;
//             padding-top: 15px;
//         }
//         .footer-disclaimer {
//             padding: 20px 40px;
//             font-size: 12px;
//             color: #888888;
//             text-align: left;
//             line-height: 1.5;
//         }
//         .footer-bottom { text-align: center; font-size: 11px; color: #999; margin-top: 20px; }
//     </style>
// </head>
// <body>
//     <div class="wrapper">
//         <div class="container">
//             <div class="header">
//                 <img src="https://storage.googleapis.com/dumpster-df2b0.appspot.com/uploads/1773331938462.jpg" alt="Bins App Logo" class="logo">
//             </div>
//             <div class="content">
//                 <h1 class="title"> ${title}</h1>
//                 <p class="subhead">${description}</p>
//                 <a href="${orderLink}" class="cta-button">View order in BINS APP</a>

//                 <p style="font-size: 14px; margin-top: 15px;">
//                     <a href="${orderLink}" style="color: #0c64c0; text-decoration: none;">Open Order Details</a>
//                 </p>
//             </div>

//             <div class="footer-disclaimer">
//                 You’re receiving this email because you have BINS APP notifications enabled.<br>
//                 Questions? Contact us at <a href="mailto:info@binsapp.ai" style="color: #0EBE3C;">info@binsapp.ai</a><br>
//                 This order is subject to the BINS APP Terms of Service and applicable policies.
//             </div>

//             <div class="sig-footer">
//                 <div class="sig-name">John Zaloum</div>
//                 <div class="sig-title">Founder/CEO — BINS APP CORP</div>
//                 <div class="sig-details">
//                     <strong>Direct:</strong> (407) 250-5860 | (989) 578-0202<br>
//                     <strong>Email:</strong> <a href="mailto:INFO@BINSAPP.AI">INFO@BINSAPP.AI</a><br>
//                     <strong>Web:</strong> <a href="http://WWW.BinsApp.ai">WWW.BinsApp.ai</a><br>
//                     <strong>LinkedIn:</strong> <a href="https://www.linkedin.com/in/john-zaloum-0742734b/">View Profile</a>
//                 </div>
//                 <div class="tagline">
//                     "Trash to scrap, get a dumpster in a snap, just tap that APP!"<br>
//                     <span style="color: #0c64c0; font-size: 14px;">Join the Waste Revolution™ — TAP-Toss-Done</span>
//                 </div>
//                 <p style="font-size: 11px; color: #aaa; margin-top: 15px;">
//                     As Featured in <em>Waste Advantage Magazine</em>
//                 </p>
//             </div>
//         </div>
//         <div class="footer-bottom">
//             &copy; ${new Date().getFullYear()} BINS APP CORP. All rights reserved.
//         </div>
//     </div>
// </body>
// </html>
// `;
// }

export function orderChangeOfferTemplate(orderLink) {
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Order Change Offer - BINS APP</title>
    <style>
        body {
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            margin: 0; padding: 0;
            background-color: #f4f7f6;
            color: #333333;
        }
        .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f6; padding-bottom: 40px; }
        .container {
            max-width: 600px;
            margin: 40px auto 20px;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
        }
        .header { padding: 40px 20px; text-align: center; }
        .logo { max-width: 120px; height: auto; border-radius: 100%; }
        .content { padding: 0 40px 30px; text-align: center; }
        .title { font-size: 28px; font-weight: 700; color: #1a1a1a; margin-bottom: 5px; }
        .subhead { font-size: 18px; color: #666666; margin-bottom: 25px; }
        
        .cta-button {
            display: inline-block;
            background-color: #0EBE3C;
            color: #ffffff !important;
            padding: 16px 32px;
            text-decoration: none;
            font-weight: bold;
            border-radius: 8px;
            margin: 20px 0;
            font-size: 18px;
        }

        .main-message { font-size: 16px; color: #444444; line-height: 1.6; margin-bottom: 25px; text-align: left; }
        
        /* Signature Footer Block */
        .sig-footer {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            padding: 30px 40px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
        }
        .sig-name { font-size: 18px; font-weight: bold; color: #1a1a1a; margin-bottom: 4px; }
        .sig-title { font-size: 14px; color: #0EBE3C; font-weight: bold; text-transform: uppercase; margin-bottom: 15px; }
        .sig-details { font-size: 13px; color: #555555; line-height: 1.8; }
        .sig-details a { color: #0c64c0; text-decoration: none; font-weight: bold; }
        .tagline { 
            margin-top: 20px; 
            font-style: italic; 
            color: #0EBE3C; 
            font-weight: 600; 
            border-top: 1px solid #eee; 
            padding-top: 15px; 
        }
        .footer-disclaimer {
            padding: 20px 40px;
            font-size: 12px;
            color: #888888;
            text-align: left;
            line-height: 1.5;
        }
        .footer-bottom { text-align: center; font-size: 11px; color: #999; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="header">
                <img src="https://storage.googleapis.com/dumpster-df2b0.appspot.com/uploads/1773331938462.jpg" alt="Bins App Logo" class="logo">
            </div>
            <div class="content">
                <h1 class="title"> Order Change Offer </h1>
                <p class="subhead">A change request has been made for your order.</p>
                
                <div class="main-message">
                    You have an order change offer on <strong>BINS APP</strong>. Open the app to review the proposed changes (delivery date, container size, or rental period).<br><br>
                    Accept or decline in seconds.
                </div>

                <a href="${orderLink}" class="cta-button">Review Changes in BINS APP</a>
                
                <p style="font-size: 14px; margin-top: 15px;">
                    <a href="${orderLink}" style="color: #0c64c0; text-decoration: none;">Open Change Details</a>
                </p>
            </div>

            <div class="footer-disclaimer">
                You’re receiving this email because you have BINS APP notifications enabled.<br>
                Questions? Contact us at <a href="mailto:info@binsapp.ai" style="color: #0EBE3C;">info@binsapp.ai</a><br>
                This order is subject to the BINS APP Terms of Service and applicable policies.
            </div>

            <div class="sig-footer">
                <div class="sig-name">John Zaloum</div>
                <div class="sig-title">Founder/CEO — BINS APP CORP</div>
                <div class="sig-details">
                    <strong>Direct:</strong> (407) 250-5860 | (989) 578-0202<br>
                    <strong>Email:</strong> <a href="mailto:INFO@BINSAPP.AI">INFO@BINSAPP.AI</a><br>
                    <strong>Web:</strong> <a href="http://WWW.BinsApp.ai">WWW.BinsApp.ai</a><br>
                    <strong>LinkedIn:</strong> <a href="https://www.linkedin.com/in/john-zaloum-0742734b/">View Profile</a>
                </div>
                <div class="tagline">
                    "Trash to scrap, get a dumpster in a snap, just tap that APP!"<br>
                    <span style="color: #0c64c0; font-size: 14px;">Join the Waste Revolution™ — TAP-Toss-Done</span>
                </div>
                <p style="font-size: 11px; color: #aaa; margin-top: 15px;">
                    As Featured in <em>Waste Advantage Magazine</em>
                </p>
            </div>
        </div>
        <div class="footer-bottom">
            &copy; ${new Date().getFullYear()} BINS APP CORP. All rights reserved.
        </div>
    </div>
</body>
</html>
`;
}

export function ratingEmailTemplate(
  orderLink,
  rating = 5,
  customerName = "A customer",
) {
  const stars =
    "★".repeat(Math.round(rating)) + "☆".repeat(5 - Math.round(rating));
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Rating Received - BINS APP</title>
    <style>
        body {
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            margin: 0; padding: 0;
            background-color: #f4f7f6;
            color: #333333;
        }
        .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f6; padding-bottom: 40px; }
        .container {
            max-width: 600px;
            margin: 40px auto 20px;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
        }
        .header { padding: 40px 20px; text-align: center; }
        .logo { max-width: 120px; height: auto; border-radius: 100%; }
        .content { padding: 0 40px 30px; text-align: center; }
        .title { font-size: 28px; font-weight: 700; color: #1a1a1a; margin-bottom: 5px; }
        .subhead { font-size: 18px; color: #666666; margin-bottom: 25px; }
        
        .rating-box {
            background-color: #fff9e6;
            border: 1px solid #ffeeba;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 25px;
            text-align: center;
        }
        .stars {
            font-size: 36px;
            color: #FFD700;
            margin-bottom: 10px;
            letter-spacing: 5px;
        }
        .rating-text {
            font-size: 16px;
            color: #856404;
            font-weight: 600;
        }

        .cta-button {
            display: inline-block;
            background-color: #0EBE3C;
            color: #ffffff !important;
            padding: 16px 32px;
            text-decoration: none;
            font-weight: bold;
            border-radius: 8px;
            margin: 20px 0;
            font-size: 18px;
        }

        .main-message { font-size: 16px; color: #444444; line-height: 1.6; margin-bottom: 25px; text-align: left; }
        
        /* Signature Footer Block */
        .sig-footer {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            padding: 30px 40px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
        }
        .sig-name { font-size: 18px; font-weight: bold; color: #1a1a1a; margin-bottom: 4px; }
        .sig-title { font-size: 14px; color: #0EBE3C; font-weight: bold; text-transform: uppercase; margin-bottom: 15px; }
        .sig-details { font-size: 13px; color: #555555; line-height: 1.8; }
        .sig-details a { color: #0c64c0; text-decoration: none; font-weight: bold; }
        .tagline { 
            margin-top: 20px; 
            font-style: italic; 
            color: #0EBE3C; 
            font-weight: 600; 
            border-top: 1px solid #eee; 
            padding-top: 15px; 
        }
        .footer-disclaimer {
            padding: 20px 40px;
            font-size: 12px;
            color: #888888;
            text-align: left;
            line-height: 1.5;
        }
        .footer-bottom { text-align: center; font-size: 11px; color: #999; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="header">
                <img src="https://storage.googleapis.com/dumpster-df2b0.appspot.com/uploads/1773331938462.jpg" alt="Bins App Logo" class="logo">
            </div>
            <div class="content">
                <h1 class="title">You've Been Rated!</h1>
                <p class="subhead">${customerName} has shared their experience.</p>
                
                <div class="rating-box">
                    <div class="stars">${stars}</div>
                    <div class="rating-text">You received a ${rating}-star rating!</div>
                </div>

                <div class="main-message">
                    Great job! Your recent service has been recognized. Maintaining high ratings is key to growing your business on <strong>BINS APP</strong>.<br><br>
                    Open the app to see the full feedback and keep up the excellent work!
                </div>

                <a href="${orderLink}" class="cta-button">View Your Rating</a>
                
                <p style="font-size: 14px; margin-top: 15px;">
                    <a href="${orderLink}" style="color: #0c64c0; text-decoration: none;">Review Detailed Feedback</a>
                </p>
            </div>

            <div class="footer-disclaimer">
                You’re receiving this email because you have BINS APP notifications enabled.<br>
                Questions? Contact us at <a href="mailto:info@binsapp.ai" style="color: #0EBE3C;">info@binsapp.ai</a><br>
                This notification is subject to the BINS APP Terms of Service.
            </div>

            <div class="sig-footer">
                <div class="sig-name">John Zaloum</div>
                <div class="sig-title">Founder/CEO — BINS APP CORP</div>
                <div class="sig-details">
                    <strong>Direct:</strong> (407) 250-5860 | (989) 578-0202<br>
                    <strong>Email:</strong> <a href="mailto:INFO@BINSAPP.AI">INFO@BINSAPP.AI</a><br>
                    <strong>Web:</strong> <a href="http://WWW.BinsApp.ai">WWW.BinsApp.ai</a><br>
                    <strong>LinkedIn:</strong> <a href="https://www.linkedin.com/in/john-zaloum-0742734b/">View Profile</a>
                </div>
                <div class="tagline">
                    "Trash to scrap, get a dumpster in a snap, just tap that APP!"<br>
                    <span style="color: #0c64c0; font-size: 14px;">Join the Waste Revolution™ — TAP-Toss-Done</span>
                </div>
                <p style="font-size: 11px; color: #aaa; margin-top: 15px;">
                    As Featured in <em>Waste Advantage Magazine</em>
                </p>
            </div>
        </div>
        <div class="footer-bottom">
            &copy; ${new Date().getFullYear()} BINS APP CORP. All rights reserved.
        </div>
    </div>
</body>
</html>
`;
}

export function offerAcceptedTemplate(orderLink) {
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Offer has been completed - BINS APP</title>
    <style>
        body {
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            margin: 0; padding: 0;
            background-color: #f4f7f6;
            color: #333333;
        }
        .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f6; padding-bottom: 40px; }
        .container {
            max-width: 600px;
            margin: 40px auto 20px;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
        }
        .header { padding: 40px 20px; text-align: center; }
        .logo { max-width: 120px; height: auto; border-radius: 100%; }
        .content { padding: 0 40px 30px; text-align: center; }
        .title { font-size: 28px; font-weight: 700; color: #1a1a1a; margin-bottom: 5px; }
        .subhead { font-size: 18px; color: #666666; margin-bottom: 25px; }
        
        .cta-button {
            display: inline-block;
            background-color: #0EBE3C;
            color: #ffffff !important;
            padding: 16px 32px;
            text-decoration: none;
            font-weight: bold;
            border-radius: 8px;
            margin: 20px 0;
            font-size: 18px;
        }

        .main-message { font-size: 16px; color: #444444; line-height: 1.6; margin-bottom: 25px; text-align: left; }
        
        /* Signature Footer Block */
        .sig-footer {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            padding: 30px 40px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
        }
        .sig-name { font-size: 18px; font-weight: bold; color: #1a1a1a; margin-bottom: 4px; }
        .sig-title { font-size: 14px; color: #0EBE3C; font-weight: bold; text-transform: uppercase; margin-bottom: 15px; }
        .sig-details { font-size: 13px; color: #555555; line-height: 1.8; }
        .sig-details a { color: #0c64c0; text-decoration: none; font-weight: bold; }
        .tagline { 
            margin-top: 20px; 
            font-style: italic; 
            color: #0EBE3C; 
            font-weight: 600; 
            border-top: 1px solid #eee; 
            padding-top: 15px; 
        }
        .footer-disclaimer {
            padding: 20px 40px;
            font-size: 12px;
            color: #888888;
            text-align: left;
            line-height: 1.5;
        }
        .footer-bottom { text-align: center; font-size: 11px; color: #999; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="header">
                <img src="https://storage.googleapis.com/dumpster-df2b0.appspot.com/uploads/1773331938462.jpg" alt="Bins App Logo" class="logo">
            </div>
            <div class="content">
                <h1 class="title"> Order Offer Accepted </h1>
                <p class="subhead">A customer request is available in your area.</p>
                
                <div class="main-message">
                    Your order offer has been accepted on <strong>BINS APP</strong>.
                </div>

                <a href="${orderLink}" class="cta-button">View order in BINS APP</a>
                
                <p style="font-size: 14px; margin-top: 15px;">
                    <a href="${orderLink}" style="color: #0c64c0; text-decoration: none;">Open Order Details</a>
                </p>
            </div>

            <div class="footer-disclaimer">
                You’re receiving this email because you have BINS APP notifications enabled.<br>
                Questions? Contact us at <a href="mailto:info@binsapp.ai" style="color: #0EBE3C;">info@binsapp.ai</a><br>
                This order is subject to the BINS APP Terms of Service and applicable policies.
            </div>

            <div class="sig-footer">
                <div class="sig-name">John Zaloum</div>
                <div class="sig-title">Founder/CEO — BINS APP CORP</div>
                <div class="sig-details">
                    <strong>Direct:</strong> (407) 250-5860 | (989) 578-0202<br>
                    <strong>Email:</strong> <a href="mailto:INFO@BINSAPP.AI">INFO@BINSAPP.AI</a><br>
                    <strong>Web:</strong> <a href="http://WWW.BinsApp.ai">WWW.BinsApp.ai</a><br>
                    <strong>LinkedIn:</strong> <a href="https://www.linkedin.com/in/john-zaloum-0742734b/">View Profile</a>
                </div>
                <div class="tagline">
                    "Trash to scrap, get a dumpster in a snap, just tap that APP!"<br>
                    <span style="color: #0c64c0; font-size: 14px;">Join the Waste Revolution™ — TAP-Toss-Done</span>
                </div>
                <p style="font-size: 11px; color: #aaa; margin-top: 15px;">
                    As Featured in <em>Waste Advantage Magazine</em>
                </p>
            </div>
        </div>
        <div class="footer-bottom">
            &copy; ${new Date().getFullYear()} BINS APP CORP. All rights reserved.
        </div>
    </div>
</body>
</html>
`;
}

export function buttonTemplate(
  orderLink,
  title = "BINS APP Update",
  description = "You have a new update on your order. Open the app to review the details.",
) {
  const safeTitle = title || "BINS APP Update";
  const safeDescription =
    description || "You have a new update on your order. Open the app to review the details.";
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeTitle} - BINS APP</title>
    <style>
        body {
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            margin: 0; padding: 0;
            background-color: #f4f7f6;
            color: #333333;
        }
        .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f6; padding-bottom: 40px; }
        .container {
            max-width: 600px;
            margin: 40px auto 20px;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
        }
        .header { padding: 40px 20px; text-align: center; }
        .logo { max-width: 120px; height: auto; border-radius: 100%; }
        .content { padding: 0 40px 30px; text-align: center; }
        .title { font-size: 28px; font-weight: 700; color: #1a1a1a; margin-bottom: 5px; }
        .subhead { font-size: 18px; color: #666666; margin-bottom: 25px; }
        
        .cta-button {
            display: inline-block;
            background-color: #0EBE3C;
            color: #ffffff !important;
            padding: 16px 32px;
            text-decoration: none;
            font-weight: bold;
            border-radius: 8px;
            margin: 20px 0;
            font-size: 18px;
        }

        .main-message { font-size: 16px; color: #444444; line-height: 1.6; margin-bottom: 25px; text-align: left; }
        
        /* Signature Footer Block */
        .sig-footer {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            padding: 30px 40px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
        }
        .sig-name { font-size: 18px; font-weight: bold; color: #1a1a1a; margin-bottom: 4px; }
        .sig-title { font-size: 14px; color: #0EBE3C; font-weight: bold; text-transform: uppercase; margin-bottom: 15px; }
        .sig-details { font-size: 13px; color: #555555; line-height: 1.8; }
        .sig-details a { color: #0c64c0; text-decoration: none; font-weight: bold; }
        .tagline { 
            margin-top: 20px; 
            font-style: italic; 
            color: #0EBE3C; 
            font-weight: 600; 
            border-top: 1px solid #eee; 
            padding-top: 15px; 
        }
        .footer-disclaimer {
            padding: 20px 40px;
            font-size: 12px;
            color: #888888;
            text-align: left;
            line-height: 1.5;
        }
        .footer-bottom { text-align: center; font-size: 11px; color: #999; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="header">
                <img src="https://storage.googleapis.com/dumpster-df2b0.appspot.com/uploads/1773331938462.jpg" alt="Bins App Logo" class="logo">
            </div>
            <div class="content">
                <h1 class="title">${safeTitle}</h1>

                <div class="main-message">
                    ${safeDescription}
                </div>

                <a href="${orderLink}" class="cta-button">View order in BINS APP</a>
                
                <p style="font-size: 14px; margin-top: 15px;">
                    <a href="${orderLink}" style="color: #0c64c0; text-decoration: none;">Open Order Details</a>
                </p>
            </div>

            <div class="footer-disclaimer">
                You’re receiving this email because you have BINS APP notifications enabled.<br>
                Questions? Contact us at <a href="mailto:info@binsapp.ai" style="color: #0EBE3C;">info@binsapp.ai</a><br>
                This order is subject to the BINS APP Terms of Service and applicable policies.
            </div>

            <div class="sig-footer">
                <div class="sig-name">John Zaloum</div>
                <div class="sig-title">Founder/CEO — BINS APP CORP</div>
                <div class="sig-details">
                    <strong>Direct:</strong> (407) 250-5860 | (989) 578-0202<br>
                    <strong>Email:</strong> <a href="mailto:INFO@BINSAPP.AI">INFO@BINSAPP.AI</a><br>
                    <strong>Web:</strong> <a href="http://WWW.BinsApp.ai">WWW.BinsApp.ai</a><br>
                    <strong>LinkedIn:</strong> <a href="https://www.linkedin.com/in/john-zaloum-0742734b/">View Profile</a>
                </div>
                <div class="tagline">
                    "Trash to scrap, get a dumpster in a snap, just tap that APP!"<br>
                    <span style="color: #0c64c0; font-size: 14px;">Join the Waste Revolution™ — TAP-Toss-Done</span>
                </div>
                <p style="font-size: 11px; color: #aaa; margin-top: 15px;">
                    As Featured in <em>Waste Advantage Magazine</em>
                </p>
            </div>
        </div>
        <div class="footer-bottom">
            &copy; ${new Date().getFullYear()} BINS APP CORP. All rights reserved.
        </div>
    </div>
</body>
</html>
`;
}

// export function orderChangeOfferTemplate(orderLink) {
//   return `
// <!DOCTYPE html>
// <html>
// <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <title>Order Change Offer - BINS APP</title>
//     <style>
//         body {
//             font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
//             margin: 0; padding: 0;
//             background-color: #f4f7f6;
//             color: #333333;
//         }
//         .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f6; padding-bottom: 40px; }
//         .container {
//             max-width: 600px;
//             margin: 40px auto 20px;
//             background-color: #ffffff;
//             border-radius: 12px;
//             overflow: hidden;
//             box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
//         }
//         .header { padding: 40px 20px; text-align: center; }
//         .logo { max-width: 120px; height: auto; border-radius: 100%; }
//         .content { padding: 0 40px 30px; text-align: center; }
//         .title { font-size: 28px; font-weight: 700; color: #1a1a1a; margin-bottom: 5px; }
//         .subhead { font-size: 18px; color: #666666; margin-bottom: 25px; }

//         .cta-button {
//             display: inline-block;
//             background-color: #0EBE3C;
//             color: #ffffff !important;
//             padding: 16px 32px;
//             text-decoration: none;
//             font-weight: bold;
//             border-radius: 8px;
//             margin: 20px 0;
//             font-size: 18px;
//         }

//         .main-message { font-size: 16px; color: #444444; line-height: 1.6; margin-bottom: 25px; text-align: left; }

//         /* Signature Footer Block */
//         .sig-footer {
//             max-width: 600px;
//             margin: 0 auto;
//             background-color: #ffffff;
//             border-radius: 12px;
//             padding: 30px 40px;
//             box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
//         }
//         .sig-name { font-size: 18px; font-weight: bold; color: #1a1a1a; margin-bottom: 4px; }
//         .sig-title { font-size: 14px; color: #0EBE3C; font-weight: bold; text-transform: uppercase; margin-bottom: 15px; }
//         .sig-details { font-size: 13px; color: #555555; line-height: 1.8; }
//         .sig-details a { color: #0c64c0; text-decoration: none; font-weight: bold; }
//         .tagline {
//             margin-top: 20px;
//             font-style: italic;
//             color: #0EBE3C;
//             font-weight: 600;
//             border-top: 1px solid #eee;
//             padding-top: 15px;
//         }
//         .footer-disclaimer {
//             padding: 20px 40px;
//             font-size: 12px;
//             color: #888888;
//             text-align: left;
//             line-height: 1.5;
//         }
//         .footer-bottom { text-align: center; font-size: 11px; color: #999; margin-top: 20px; }
//     </style>
// </head>
// <body>
//     <div class="wrapper">
//         <div class="container">
//             <div class="header">
//                 <img src="https://storage.googleapis.com/dumpster-df2b0.appspot.com/uploads/1773331938462.jpg" alt="Bins App Logo" class="logo">
//             </div>
//             <div class="content">
//                 <h1 class="title"> Order Change Offer </h1>
//                 <p class="subhead">A change request has been made for your order.</p>

//                 <div class="main-message">
//                     You have an order change offer on <strong>BINS APP</strong>. Open the app to review the proposed changes (delivery date, container size, or rental period).<br><br>
//                     Accept or decline in seconds.
//                 </div>

//                 <a href="${orderLink}" class="cta-button">Review Changes in BINS APP</a>

//                 <p style="font-size: 14px; margin-top: 15px;">
//                     <a href="${orderLink}" style="color: #0c64c0; text-decoration: none;">Open Change Details</a>
//                 </p>
//             </div>

//             <div class="footer-disclaimer">
//                 You’re receiving this email because you have BINS APP notifications enabled.<br>
//                 Questions? Contact us at <a href="mailto:info@binsapp.ai" style="color: #0EBE3C;">info@binsapp.ai</a><br>
//                 This order is subject to the BINS APP Terms of Service and applicable policies.
//             </div>

//             <div class="sig-footer">
//                 <div class="sig-name">John Zaloum</div>
//                 <div class="sig-title">Founder/CEO — BINS APP CORP</div>
//                 <div class="sig-details">
//                     <strong>Direct:</strong> (407) 250-5860 | (989) 578-0202<br>
//                     <strong>Email:</strong> <a href="mailto:INFO@BINSAPP.AI">INFO@BINSAPP.AI</a><br>
//                     <strong>Web:</strong> <a href="http://WWW.BinsApp.ai">WWW.BinsApp.ai</a><br>
//                     <strong>LinkedIn:</strong> <a href="https://www.linkedin.com/in/john-zaloum-0742734b/">View Profile</a>
//                 </div>
//                 <div class="tagline">
//                     "Trash to scrap, get a dumpster in a snap, just tap that APP!"<br>
//                     <span style="color: #0c64c0; font-size: 14px;">Join the Waste Revolution™ — TAP-Toss-Done</span>
//                 </div>
//                 <p style="font-size: 11px; color: #aaa; margin-top: 15px;">
//                     As Featured in <em>Waste Advantage Magazine</em>
//                 </p>
//             </div>
//         </div>
//         <div class="footer-bottom">
//             &copy; ${new Date().getFullYear()} BINS APP CORP. All rights reserved.
//         </div>
//     </div>
// </body>
// </html>
// `;
// }

// export function ratingEmailTemplate(
//   orderLink,
//   rating = 5,
//   customerName = "A customer",
// ) {
//   const stars =
//     "★".repeat(Math.round(rating)) + "☆".repeat(5 - Math.round(rating));
//   return `
// <!DOCTYPE html>
// <html>
// <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <title>New Rating Received - BINS APP</title>
//     <style>
//         body {
//             font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
//             margin: 0; padding: 0;
//             background-color: #f4f7f6;
//             color: #333333;
//         }
//         .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f6; padding-bottom: 40px; }
//         .container {
//             max-width: 600px;
//             margin: 40px auto 20px;
//             background-color: #ffffff;
//             border-radius: 12px;
//             overflow: hidden;
//             box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
//         }
//         .header { padding: 40px 20px; text-align: center; }
//         .logo { max-width: 120px; height: auto; border-radius: 100%; }
//         .content { padding: 0 40px 30px; text-align: center; }
//         .title { font-size: 28px; font-weight: 700; color: #1a1a1a; margin-bottom: 5px; }
//         .subhead { font-size: 18px; color: #666666; margin-bottom: 25px; }

//         .rating-box {
//             background-color: #fff9e6;
//             border: 1px solid #ffeeba;
//             border-radius: 8px;
//             padding: 20px;
//             margin-bottom: 25px;
//             text-align: center;
//         }
//         .stars {
//             font-size: 36px;
//             color: #FFD700;
//             margin-bottom: 10px;
//             letter-spacing: 5px;
//         }
//         .rating-text {
//             font-size: 16px;
//             color: #856404;
//             font-weight: 600;
//         }

//         .cta-button {
//             display: inline-block;
//             background-color: #0EBE3C;
//             color: #ffffff !important;
//             padding: 16px 32px;
//             text-decoration: none;
//             font-weight: bold;
//             border-radius: 8px;
//             margin: 20px 0;
//             font-size: 18px;
//         }

//         .main-message { font-size: 16px; color: #444444; line-height: 1.6; margin-bottom: 25px; text-align: left; }

//         /* Signature Footer Block */
//         .sig-footer {
//             max-width: 600px;
//             margin: 0 auto;
//             background-color: #ffffff;
//             border-radius: 12px;
//             padding: 30px 40px;
//             box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
//         }
//         .sig-name { font-size: 18px; font-weight: bold; color: #1a1a1a; margin-bottom: 4px; }
//         .sig-title { font-size: 14px; color: #0EBE3C; font-weight: bold; text-transform: uppercase; margin-bottom: 15px; }
//         .sig-details { font-size: 13px; color: #555555; line-height: 1.8; }
//         .sig-details a { color: #0c64c0; text-decoration: none; font-weight: bold; }
//         .tagline {
//             margin-top: 20px;
//             font-style: italic;
//             color: #0EBE3C;
//             font-weight: 600;
//             border-top: 1px solid #eee;
//             padding-top: 15px;
//         }
//         .footer-disclaimer {
//             padding: 20px 40px;
//             font-size: 12px;
//             color: #888888;
//             text-align: left;
//             line-height: 1.5;
//         }
//         .footer-bottom { text-align: center; font-size: 11px; color: #999; margin-top: 20px; }
//     </style>
// </head>
// <body>
//     <div class="wrapper">
//         <div class="container">
//             <div class="header">
//                 <img src="https://storage.googleapis.com/dumpster-df2b0.appspot.com/uploads/1773331938462.jpg" alt="Bins App Logo" class="logo">
//             </div>
//             <div class="content">
//                 <h1 class="title">You've Been Rated!</h1>
//                 <p class="subhead">${customerName} has shared their experience.</p>

//                 <div class="rating-box">
//                     <div class="stars">${stars}</div>
//                     <div class="rating-text">You received a ${rating}-star rating!</div>
//                 </div>

//                 <div class="main-message">
//                     Great job! Your recent service has been recognized. Maintaining high ratings is key to growing your business on <strong>BINS APP</strong>.<br><br>
//                     Open the app to see the full feedback and keep up the excellent work!
//                 </div>

//                 <a href="${orderLink}" class="cta-button">View Your Rating</a>

//                 <p style="font-size: 14px; margin-top: 15px;">
//                     <a href="${orderLink}" style="color: #0c64c0; text-decoration: none;">Review Detailed Feedback</a>
//                 </p>
//             </div>

//             <div class="footer-disclaimer">
//                 You’re receiving this email because you have BINS APP notifications enabled.<br>
//                 Questions? Contact us at <a href="mailto:info@binsapp.ai" style="color: #0EBE3C;">info@binsapp.ai</a><br>
//                 This notification is subject to the BINS APP Terms of Service.
//             </div>

//             <div class="sig-footer">
//                 <div class="sig-name">John Zaloum</div>
//                 <div class="sig-title">Founder/CEO — BINS APP CORP</div>
//                 <div class="sig-details">
//                     <strong>Direct:</strong> (407) 250-5860 | (989) 578-0202<br>
//                     <strong>Email:</strong> <a href="mailto:INFO@BINSAPP.AI">INFO@BINSAPP.AI</a><br>
//                     <strong>Web:</strong> <a href="http://WWW.BinsApp.ai">WWW.BinsApp.ai</a><br>
//                     <strong>LinkedIn:</strong> <a href="https://www.linkedin.com/in/john-zaloum-0742734b/">View Profile</a>
//                 </div>
//                 <div class="tagline">
//                     "Trash to scrap, get a dumpster in a snap, just tap that APP!"<br>
//                     <span style="color: #0c64c0; font-size: 14px;">Join the Waste Revolution™ — TAP-Toss-Done</span>
//                 </div>
//                 <p style="font-size: 11px; color: #aaa; margin-top: 15px;">
//                     As Featured in <em>Waste Advantage Magazine</em>
//                 </p>
//             </div>
//         </div>
//         <div class="footer-bottom">
//             &copy; ${new Date().getFullYear()} BINS APP CORP. All rights reserved.
//         </div>
//     </div>
// </body>
// </html>
// `;
// }

// export function offerAcceptedTemplate(orderLink) {
//   return `
// <!DOCTYPE html>
// <html>
// <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <title>Your Offer has been completed - BINS APP</title>
//     <style>
//         body {
//             font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
//             margin: 0; padding: 0;
//             background-color: #f4f7f6;
//             color: #333333;
//         }
//         .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f6; padding-bottom: 40px; }
//         .container {
//             max-width: 600px;
//             margin: 40px auto 20px;
//             background-color: #ffffff;
//             border-radius: 12px;
//             overflow: hidden;
//             box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
//         }
//         .header { padding: 40px 20px; text-align: center; }
//         .logo { max-width: 120px; height: auto; border-radius: 100%; }
//         .content { padding: 0 40px 30px; text-align: center; }
//         .title { font-size: 28px; font-weight: 700; color: #1a1a1a; margin-bottom: 5px; }
//         .subhead { font-size: 18px; color: #666666; margin-bottom: 25px; }

//         .cta-button {
//             display: inline-block;
//             background-color: #0EBE3C;
//             color: #ffffff !important;
//             padding: 16px 32px;
//             text-decoration: none;
//             font-weight: bold;
//             border-radius: 8px;
//             margin: 20px 0;
//             font-size: 18px;
//         }

//         .main-message { font-size: 16px; color: #444444; line-height: 1.6; margin-bottom: 25px; text-align: left; }

//         /* Signature Footer Block */
//         .sig-footer {
//             max-width: 600px;
//             margin: 0 auto;
//             background-color: #ffffff;
//             border-radius: 12px;
//             padding: 30px 40px;
//             box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
//         }
//         .sig-name { font-size: 18px; font-weight: bold; color: #1a1a1a; margin-bottom: 4px; }
//         .sig-title { font-size: 14px; color: #0EBE3C; font-weight: bold; text-transform: uppercase; margin-bottom: 15px; }
//         .sig-details { font-size: 13px; color: #555555; line-height: 1.8; }
//         .sig-details a { color: #0c64c0; text-decoration: none; font-weight: bold; }
//         .tagline {
//             margin-top: 20px;
//             font-style: italic;
//             color: #0EBE3C;
//             font-weight: 600;
//             border-top: 1px solid #eee;
//             padding-top: 15px;
//         }
//         .footer-disclaimer {
//             padding: 20px 40px;
//             font-size: 12px;
//             color: #888888;
//             text-align: left;
//             line-height: 1.5;
//         }
//         .footer-bottom { text-align: center; font-size: 11px; color: #999; margin-top: 20px; }
//     </style>
// </head>
// <body>
//     <div class="wrapper">
//         <div class="container">
//             <div class="header">
//                 <img src="https://storage.googleapis.com/dumpster-df2b0.appspot.com/uploads/1773331938462.jpg" alt="Bins App Logo" class="logo">
//             </div>
//             <div class="content">
//                 <h1 class="title"> Order Offer Accepted </h1>
//                 <p class="subhead">A customer request is available in your area.</p>

//                 <div class="main-message">
//                     Your order offer has been accepted on <strong>BINS APP</strong>.
//                 </div>

//                 <a href="${orderLink}" class="cta-button">View order in BINS APP</a>

//                 <p style="font-size: 14px; margin-top: 15px;">
//                     <a href="${orderLink}" style="color: #0c64c0; text-decoration: none;">Open Order Details</a>
//                 </p>
//             </div>

//             <div class="footer-disclaimer">
//                 You’re receiving this email because you have BINS APP notifications enabled.<br>
//                 Questions? Contact us at <a href="mailto:info@binsapp.ai" style="color: #0EBE3C;">info@binsapp.ai</a><br>
//                 This order is subject to the BINS APP Terms of Service and applicable policies.
//             </div>

//             <div class="sig-footer">
//                 <div class="sig-name">John Zaloum</div>
//                 <div class="sig-title">Founder/CEO — BINS APP CORP</div>
//                 <div class="sig-details">
//                     <strong>Direct:</strong> (407) 250-5860 | (989) 578-0202<br>
//                     <strong>Email:</strong> <a href="mailto:INFO@BINSAPP.AI">INFO@BINSAPP.AI</a><br>
//                     <strong>Web:</strong> <a href="http://WWW.BinsApp.ai">WWW.BinsApp.ai</a><br>
//                     <strong>LinkedIn:</strong> <a href="https://www.linkedin.com/in/john-zaloum-0742734b/">View Profile</a>
//                 </div>
//                 <div class="tagline">
//                     "Trash to scrap, get a dumpster in a snap, just tap that APP!"<br>
//                     <span style="color: #0c64c0; font-size: 14px;">Join the Waste Revolution™ — TAP-Toss-Done</span>
//                 </div>
//                 <p style="font-size: 11px; color: #aaa; margin-top: 15px;">
//                     As Featured in <em>Waste Advantage Magazine</em>
//                 </p>
//             </div>
//         </div>
//         <div class="footer-bottom">
//             &copy; ${new Date().getFullYear()} BINS APP CORP. All rights reserved.
//         </div>
//     </div>
// </body>
// </html>
// `;
// }

/**
 * Email template sent when a partner service application is rejected.
 * @param {string} userName     - The applicant's display name.
 * @param {string} notes        - The rejection reason / notes from the admin.
 * @param {string} serviceLabel - Human-readable service name, e.g. "Junk Removal".
 */
export function serviceRejectedTemplate(userName, notes, serviceLabel) {
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Update on Your ${serviceLabel} Application - BINS APP</title>
    <style>
        body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f7f6; color: #333333; }
        .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f6; padding-bottom: 40px; }
        .container { max-width: 600px; margin: 40px auto 20px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05); }
        .header { padding: 40px 20px; text-align: center; }
        .logo { max-width: 120px; height: auto; border-radius: 100%; }
        .content { padding: 0 40px 30px; text-align: center; }
        .title { font-size: 26px; font-weight: 700; color: #d93025; margin-bottom: 5px; }
        .subhead { font-size: 18px; color: #666666; margin-bottom: 25px; }
        .reason-box { background-color: #fff4f4; border-left: 4px solid #d93025; padding: 20px; margin: 25px 0; text-align: left; border-radius: 4px; }
        .reason-title { font-weight: bold; color: #d93025; margin-bottom: 8px; font-size: 16px; }
        .reason-text { font-size: 15px; color: #444; line-height: 1.6; }
        .cta-button { display: inline-block; background-color: #0EBE3C; color: #ffffff !important; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px; margin: 20px 0; font-size: 16px; }
        .main-message { font-size: 16px; color: #444444; line-height: 1.6; margin-bottom: 25px; text-align: left; }
        .sig-footer { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; padding: 30px 40px; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05); }
        .sig-name { font-size: 18px; font-weight: bold; color: #1a1a1a; margin-bottom: 4px; }
        .sig-title { font-size: 14px; color: #0EBE3C; font-weight: bold; text-transform: uppercase; margin-bottom: 15px; }
        .sig-details { font-size: 13px; color: #555555; line-height: 1.8; }
        .sig-details a { color: #0c64c0; text-decoration: none; font-weight: bold; }
        .tagline { margin-top: 20px; font-style: italic; color: #0EBE3C; font-weight: 600; border-top: 1px solid #eee; padding-top: 15px; }
        .footer-disclaimer { padding: 20px 40px; font-size: 12px; color: #888888; text-align: left; line-height: 1.5; }
        .footer-bottom { text-align: center; font-size: 11px; color: #999; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="header">
                <img src="https://storage.googleapis.com/dumpster-df2b0.appspot.com/uploads/1773331938462.jpg" alt="Bins App Logo" class="logo">
            </div>
            <div class="content">
                <h1 class="title">Action Required</h1>
                <p class="subhead">Update on your ${serviceLabel} Partner application.</p>

                <div class="main-message">
                    Hi <strong>${userName}</strong>,<br><br>
                    Thank you for your interest in joining <strong>BINS APP</strong>. After reviewing your application for ${serviceLabel} services, we are unable to approve it at this time due to the following reason:
                </div>

                <div class="reason-box">
                    <div class="reason-title">Rejection Reason:</div>
                    <div class="reason-text">${notes}</div>
                </div>

                <div class="main-message">
                    Please log in to your account, update the necessary information or documents, and resubmit for review.
                </div>

                <a href="https://binsapp.ai/login" class="cta-button">Update My Profile</a>
            </div>

            <div class="footer-disclaimer">
                Questions? Contact our support team at <a href="mailto:info@binsapp.ai" style="color: #0EBE3C;">info@binsapp.ai</a><br>
                This notification is regarding your registered partner account on BINS APP.
            </div>

            <div class="sig-footer">
                <div class="sig-name">John Zaloum</div>
                <div class="sig-title">Founder/CEO — BINS APP CORP</div>
                <div class="sig-details">
                    <strong>Direct:</strong> (407) 250-5860 | (989) 578-0202<br>
                    <strong>Email:</strong> <a href="mailto:INFO@BINSAPP.AI">INFO@BINSAPP.AI</a><br>
                    <strong>Web:</strong> <a href="http://WWW.BinsApp.ai">WWW.BinsApp.ai</a>
                </div>
                <div class="tagline">
                    "Trash to scrap, get a dumpster in a snap, just tap that APP!"<br>
                    <span style="color: #0c64c0; font-size: 14px;">Join the Waste Revolution™ — TAP-Toss-Done</span>
                </div>
            </div>
        </div>
        <div class="footer-bottom">
            &copy; ${new Date().getFullYear()} BINS APP CORP. All rights reserved.
        </div>
    </div>
</body>
</html>
`;
}

/**
 * Email template sent when a partner service application is approved.
 * @param {string} userName     - The applicant's display name.
 * @param {string} serviceLabel - Human-readable service name, e.g. "Tree Removal".
 */
export function serviceApprovedTemplate(userName, serviceLabel) {
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${serviceLabel} Partner Approved - BINS APP</title>
    <style>
        body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f7f6; color: #333333; }
        .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f6; padding-bottom: 40px; }
        .container { max-width: 600px; margin: 40px auto 20px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05); }
        .header { padding: 40px 20px; text-align: center; }
        .logo { max-width: 120px; height: auto; border-radius: 100%; }
        .content { padding: 0 40px 30px; text-align: center; }
        .title { font-size: 26px; font-weight: 700; color: #0EBE3C; margin-bottom: 5px; }
        .subhead { font-size: 18px; color: #666666; margin-bottom: 25px; }
        .success-box { background-color: #f0fff4; border-left: 4px solid #0EBE3C; padding: 20px; margin: 25px 0; text-align: left; border-radius: 4px; }
        .success-title { font-weight: bold; color: #0EBE3C; margin-bottom: 8px; font-size: 16px; }
        .success-text { font-size: 15px; color: #444; line-height: 1.6; }
        .cta-button { display: inline-block; background-color: #0EBE3C; color: #ffffff !important; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px; margin: 20px 0; font-size: 16px; }
        .main-message { font-size: 16px; color: #444444; line-height: 1.6; margin-bottom: 25px; text-align: left; }
        .sig-footer { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; padding: 30px 40px; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05); }
        .sig-name { font-size: 18px; font-weight: bold; color: #1a1a1a; margin-bottom: 4px; }
        .sig-title { font-size: 14px; color: #0EBE3C; font-weight: bold; text-transform: uppercase; margin-bottom: 15px; }
        .sig-details { font-size: 13px; color: #555555; line-height: 1.8; }
        .sig-details a { color: #0c64c0; text-decoration: none; font-weight: bold; }
        .tagline { margin-top: 20px; font-style: italic; color: #0EBE3C; font-weight: 600; border-top: 1px solid #eee; padding-top: 15px; }
        .footer-disclaimer { padding: 20px 40px; font-size: 12px; color: #888888; text-align: left; line-height: 1.5; }
        .footer-bottom { text-align: center; font-size: 11px; color: #999; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="header">
                <img src="https://storage.googleapis.com/dumpster-df2b0.appspot.com/uploads/1773331938462.jpg" alt="Bins App Logo" class="logo">
            </div>
            <div class="content">
                <h1 class="title">Congratulations!</h1>
                <p class="subhead">Your ${serviceLabel} Partner application has been approved.</p>

                <div class="main-message">
                    Hi <strong>${userName}</strong>,<br><br>
                    Welcome to the <strong>BINS APP</strong> family! We've reviewed your documents and business details for ${serviceLabel} services, and everything looks solid.
                </div>

                <div class="success-box">
                    <div class="success-title">Account Status: Active</div>
                    <div class="success-text">
                        You are now eligible to receive and accept order offers in your service area. Make sure your app notifications are turned on!
                    </div>
                </div>

                <div class="main-message">
                    Log in to your dashboard to start managing your jobs and tracking your payouts.
                </div>

                <a href="https://binsapp.ai/login" class="cta-button">Go to My Dashboard</a>
            </div>

            <div class="footer-disclaimer">
                Need help getting started? Reach out to us at <a href="mailto:info@binsapp.ai" style="color: #0EBE3C;">info@binsapp.ai</a><br>
                Thank you for joining the BINS APP Partner Network.
            </div>

            <div class="sig-footer">
                <div class="sig-name">John Zaloum</div>
                <div class="sig-title">Founder/CEO — BINS APP CORP</div>
                <div class="sig-details">
                    <strong>Direct:</strong> (407) 250-5860 | (989) 578-0202<br>
                    <strong>Email:</strong> <a href="mailto:INFO@BINSAPP.AI">INFO@BINSAPP.AI</a><br>
                    <strong>Web:</strong> <a href="http://WWW.BinsApp.ai">WWW.BinsApp.ai</a>
                </div>
                <div class="tagline">
                    "Trash to scrap, get a dumpster in a snap, just tap that APP!"<br>
                    <span style="color: #0c64c0; font-size: 14px;">Join the Waste Revolution™ — TAP-Toss-Done</span>
                </div>
            </div>
        </div>
        <div class="footer-bottom">
            &copy; ${new Date().getFullYear()} BINS APP CORP. All rights reserved.
        </div>
    </div>
</body>
</html>
`;
}

/**
 * Email template sent when a user submits or updates their service offerings,
 * notifying them that their application/documents are pending admin review.
 * @param {string} userName     - The applicant's display name.
 * @param {string} serviceLabel - Human-readable service name(s), e.g. "Junk Removal".
 */
export function servicePendingReviewTemplate(userName = "Partner", serviceLabel = "Service Offerings") {
  const safeName = userName || "Partner";
  const safeLabel = serviceLabel || "Service Offerings";

  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeLabel} Application Under Review - BINS APP</title>
    <style>
        body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f7f6; color: #333333; }
        .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f6; padding-bottom: 40px; }
        .container { max-width: 600px; margin: 40px auto 20px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05); }
        .header { padding: 40px 20px; text-align: center; }
        .logo { max-width: 120px; height: auto; border-radius: 100%; }
        .content { padding: 0 40px 30px; text-align: center; }
        .title { font-size: 26px; font-weight: 700; color: #d97706; margin-bottom: 5px; }
        .subhead { font-size: 18px; color: #666666; margin-bottom: 25px; }
        .status-box { background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 20px; margin: 25px 0; text-align: left; border-radius: 4px; }
        .status-title { font-weight: bold; color: #b45309; margin-bottom: 8px; font-size: 16px; }
        .status-text { font-size: 15px; color: #444; line-height: 1.6; }
        .cta-button { display: inline-block; background-color: #0EBE3C; color: #ffffff !important; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px; margin: 20px 0; font-size: 16px; }
        .main-message { font-size: 16px; color: #444444; line-height: 1.6; margin-bottom: 25px; text-align: left; }
        .sig-footer { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; padding: 30px 40px; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05); }
        .sig-name { font-size: 18px; font-weight: bold; color: #1a1a1a; margin-bottom: 4px; }
        .sig-title { font-size: 14px; color: #0EBE3C; font-weight: bold; text-transform: uppercase; margin-bottom: 15px; }
        .sig-details { font-size: 13px; color: #555555; line-height: 1.8; }
        .sig-details a { color: #0c64c0; text-decoration: none; font-weight: bold; }
        .tagline { margin-top: 20px; font-style: italic; color: #0EBE3C; font-weight: 600; border-top: 1px solid #eee; padding-top: 15px; }
        .footer-disclaimer { padding: 20px 40px; font-size: 12px; color: #888888; text-align: left; line-height: 1.5; }
        .footer-bottom { text-align: center; font-size: 11px; color: #999; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="header">
                <img src="https://storage.googleapis.com/dumpster-df2b0.appspot.com/uploads/1773331938462.jpg" alt="Bins App Logo" class="logo">
            </div>
            <div class="content">
                <h1 class="title">Verification in Progress</h1>
                <p class="subhead">Your updated service offerings are under review.</p>

                <div class="main-message">
                    Hi <strong>${safeName}</strong>,<br><br>
                    Thank you for submitting your updated service details on <strong>BINS APP</strong>. We have received your application for <strong>${safeLabel}</strong>.
                </div>

                <div class="status-box">
                    <div class="status-title">⏳ Status: Pending Admin Verification</div>
                    <div class="status-text">
                        Your submitted offerings, licenses, and documentation are currently being reviewed by our administrative team.
                        During this review window, your updated services remain temporarily pending verification.
                    </div>
                </div>

                <div class="main-message">
                    <strong>What happens next?</strong><br>
                    Our admin team will carefully inspect your submitted credentials and verification details. Once approved, your services will be immediately activated, and you will receive an automatic confirmation email and app notification.
                </div>

                <a href="https://binsapp.ai/login" class="cta-button">View My Account</a>
            </div>

            <div class="footer-disclaimer">
                Have questions or need to make adjustments? Reach out to our support team at <a href="mailto:info@binsapp.ai" style="color: #0EBE3C;">info@binsapp.ai</a>.<br>
                Thank you for partnering with BINS APP.
            </div>

            <div class="sig-footer">
                <div class="sig-name">John Zaloum</div>
                <div class="sig-title">Founder/CEO — BINS APP CORP</div>
                <div class="sig-details">
                    <strong>Direct:</strong> (407) 250-5860 | (989) 578-0202<br>
                    <strong>Email:</strong> <a href="mailto:INFO@BINSAPP.AI">INFO@BINSAPP.AI</a><br>
                    <strong>Web:</strong> <a href="http://WWW.BinsApp.ai">WWW.BinsApp.ai</a>
                </div>
                <div class="tagline">
                    "Trash to scrap, get a dumpster in a snap, just tap that APP!"<br>
                    <span style="color: #0c64c0; font-size: 14px;">Join the Waste Revolution™ — TAP-Toss-Done</span>
                </div>
            </div>
        </div>
        <div class="footer-bottom">
            &copy; ${new Date().getFullYear()} BINS APP CORP. All rights reserved.
        </div>
    </div>
</body>
</html>
`;
}

export function orderAssignedDriverTemplate({
  assignLink,
  driverName = "Driver",
  orderNumber = "",
  serviceType = "",
  address = "",
  deliveryDate = "",
}) {
  const safeName = driverName || "Driver";
  const title = "New Order Assigned!";
  const subhead = `Hello ${safeName}, a new job has been dispatched to you.`;

  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Order Assigned - BINS APP</title>
    <style>
        body {
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            margin: 0; padding: 0;
            background-color: #f4f7f6;
            color: #333333;
            -webkit-font-smoothing: antialiased;
        }
        .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f6; padding-bottom: 40px; }
        .container {
            max-width: 600px;
            margin: 40px auto 20px;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
            border: 1px solid #e9ecef;
        }
        .header { padding: 35px 20px 20px; text-align: center; background-color: #ffffff; }
        .logo { max-width: 110px; height: auto; border-radius: 100%; border: 2px solid #0EBE3C; }
        .content { padding: 10px 40px 30px; text-align: center; }
        .badge {
            display: inline-block;
            background-color: #e8f8ec;
            color: #0EBE3C;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            padding: 6px 14px;
            border-radius: 20px;
            margin-bottom: 15px;
        }
        .title { font-size: 26px; font-weight: 800; color: #1a1a1a; margin: 0 0 8px 0; }
        .subhead { font-size: 16px; color: #555555; margin-bottom: 25px; line-height: 1.5; }
        
        .order-card {
            background-color: #f8faf9;
            border: 1px solid #e1e8e4;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 25px;
            text-align: left;
        }
        .order-card-title {
            font-size: 14px;
            font-weight: 700;
            color: #0EBE3C;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 12px;
            border-bottom: 1px solid #e1e8e4;
            padding-bottom: 8px;
        }
        .order-detail-row {
            display: flex;
            justify-content: space-between;
            font-size: 14px;
            margin-bottom: 8px;
            color: #444444;
        }
        .order-detail-label { font-weight: 600; color: #666666; }

        .cta-button {
            display: inline-block;
            background-color: #0EBE3C;
            color: #ffffff !important;
            padding: 16px 36px;
            text-decoration: none;
            font-weight: 700;
            border-radius: 8px;
            margin: 20px 0 10px;
            font-size: 17px;
            box-shadow: 0 4px 12px rgba(14, 190, 60, 0.25);
        }

        .main-message { font-size: 15px; color: #444444; line-height: 1.6; margin-bottom: 20px; text-align: center; }
        
        .sig-footer {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            padding: 25px 40px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
            border: 1px solid #e9ecef;
        }
        .sig-name { font-size: 17px; font-weight: bold; color: #1a1a1a; margin-bottom: 4px; }
        .sig-title { font-size: 13px; color: #0EBE3C; font-weight: bold; text-transform: uppercase; margin-bottom: 12px; }
        .sig-details { font-size: 13px; color: #555555; line-height: 1.7; }
        .sig-details a { color: #0c64c0; text-decoration: none; font-weight: bold; }
        .tagline { 
            margin-top: 15px; 
            font-style: italic; 
            color: #0EBE3C; 
            font-weight: 600; 
            border-top: 1px solid #eee; 
            padding-top: 12px; 
            font-size: 13px;
        }
        .footer-disclaimer {
            padding: 20px 40px;
            font-size: 12px;
            color: #888888;
            text-align: center;
            line-height: 1.5;
        }
        .footer-bottom { text-align: center; font-size: 11px; color: #999; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="header">
                <img src="https://storage.googleapis.com/dumpster-df2b0.appspot.com/uploads/1773331938462.jpg" alt="Bins App Logo" class="logo">
            </div>
            <div class="content">
                <div class="badge">Job Assignment</div>
                <h1 class="title">${title}</h1>
                <p class="subhead">${subhead}</p>
                
                <div class="order-card">
                    <div class="order-card-title">Assignment Summary</div>
                    <div class="order-detail-row">
                        <span class="order-detail-label">Assigned To:</span>
                        <span>${safeName}</span>
                    </div>
                    ${serviceType ? `
                    <div class="order-detail-row">
                        <span class="order-detail-label">Service Type:</span>
                        <span>${serviceType}</span>
                    </div>` : ""}
                    ${orderNumber ? `
                    <div class="order-detail-row">
                        <span class="order-detail-label">Order Ref:</span>
                        <span>#${orderNumber}</span>
                    </div>` : ""}
                    ${address ? `
                    <div class="order-detail-row">
                        <span class="order-detail-label">Address:</span>
                        <span>${address}</span>
                    </div>` : ""}
                    ${deliveryDate ? `
                    <div class="order-detail-row">
                        <span class="order-detail-label">Delivery Date:</span>
                        <span>${deliveryDate}</span>
                    </div>` : ""}
                    <div class="order-detail-row">
                        <span class="order-detail-label">Action Required:</span>
                        <span>Start Route & Manage Job</span>
                    </div>
                </div>

                <div class="main-message">
                    Tap the button below to view full order details, customer notes, location coordinates, and start your route.
                </div>

                <a href="${assignLink}" class="cta-button">View Order & Start Route</a>
                
                <p style="font-size: 13px; margin-top: 15px; color: #777;">
                    Having trouble with the button? Copy and paste this link in your browser:<br>
                    <a href="${assignLink}" style="color: #0c64c0; word-break: break-all;">${assignLink}</a>
                </p>
            </div>

            <div class="footer-disclaimer">
                You’re receiving this notification because you are a registered driver on BINS APP.<br>
                Questions? Contact support at <a href="mailto:info@binsapp.ai" style="color: #0EBE3C;">info@binsapp.ai</a>
            </div>

            <div class="sig-footer">
                <div class="sig-name">John Zaloum</div>
                <div class="sig-title">Founder/CEO — BINS APP CORP</div>
                <div class="sig-details">
                    <strong>Direct:</strong> (407) 250-5860 | (989) 578-0202<br>
                    <strong>Email:</strong> <a href="mailto:INFO@BINSAPP.AI">INFO@BINSAPP.AI</a><br>
                    <strong>Web:</strong> <a href="http://WWW.BinsApp.ai">WWW.BinsApp.ai</a>
                </div>
                <div class="tagline">
                    "Trash to scrap, get a dumpster in a snap, just tap that APP!"<br>
                    <span style="color: #0c64c0; font-size: 13px;">Join the Waste Revolution™ — TAP-Toss-Done</span>
                </div>
            </div>
        </div>
        <div class="footer-bottom">
            &copy; ${new Date().getFullYear()} BINS APP CORP. All rights reserved.
        </div>
    </div>
</body>
</html>
`;
}
